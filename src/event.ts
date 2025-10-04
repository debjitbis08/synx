import { Future } from "./future";
import type { InternalReactive, Reactive } from "./reactive";
import * as R from "./reactive";
import { scheduleUpdate } from "./batch";

/**
 * Public interface for Events
 */
export interface Event<A> {
  readonly future: Future<A>;
}

/**
 * Internal interface that extends Event with methods only for Reactive to use
 */
interface InternalEvent<A> extends Event<A> {
  /**
   * Get the future (only for Reactive to call)
   * @internal
   */
  getFutureInternal(): Future<A>;
}

/**
 * Concrete implementation of Event
 * It's conceptually: newtype Event a = Ev(Future (Reactive a))
 */
export class EventImpl<A> implements InternalEvent<A> {
  // The underlying future of values
  future: Future<A>;

  _stepper?: {
    reactive: Reactive<A>;
    initial: A;
  };

  private cleanupFns = new Set<() => void>();

  /**
   * Create a new event
   * @param future The future that powers this event
   */
  constructor(future: Future<A>) {
    this.future = future;
  }

  internalAddCleanup(fn: () => void) {
    this.cleanupFns.add(fn);
  }

  internalCleanup() {
    for (const fn of this.cleanupFns) {
      try {
        fn();
      } catch (e) {
        console.error("cleanup function failed", e);
      }
    }
    this.cleanupFns.clear();

    // Stepper
    if (this._stepper) {
      R.cleanup(this._stepper.reactive);
      this._stepper = undefined;
    }
  }

  /**
   * Internal method to get the future
   * @internal
   */
  getFutureInternal(): Future<A> {
    return this.future;
  }
}

export function create<A>(): [Event<A>, (value: A) => void] {
  let reactive: InternalReactive<A> | null = null;
  let initialValue: A | null = null;
  let onFirstEmit: ((v: A) => void)[] = [];
  let innerFuture: Future<A> | null = null;

  /**
   * Since the initial value has not yet been emitted, we need a future
   * to represent that future initial value when the first emit happens.
   *
   * If we receive any subscribers before the first emit, we need to store them
   * and emit the initial value to them when we do emit it.
   */
  const initialEmitValueFuture = new Future<A>((handler) => {
    if (reactive == null) {
      onFirstEmit.push(handler);
    } else {
      handler(R.get(reactive));
    }
    return () => {
      onFirstEmit = onFirstEmit.filter((h) => h !== handler);
    };
  });

  /**
   * Now, we can use the initial value future to create a future reactive.
   * This reactive will be available when the initial emit happens.
   */
  const future = Future.reactive<A>(initialEmitValueFuture);

  /**
   * Now create a new event using another future.
   * This future is created using the future reactive.
   * When the reactive is available, we can use it to create a new future,
   * which just subscribes the handlers with the reactive.
   */
  const event = new EventImpl<A>(
    future.chain((r) => {
      if (innerFuture === null) {
        reactive = r;
        innerFuture = Future.fromReactive(r);
        return innerFuture;
      } else {
        return innerFuture;
      }
    }),
  );

  // Create the emit function that uses the event's internal emit method
  const emit = (value: A): void => {
    const emitAction = () => {
      if (onFirstEmit.length <= 0 && initialValue == null) return;
      if (reactive === null) {
        initialValue = value;
        if (onFirstEmit.length) {
          onFirstEmit.forEach((handler) => handler(value));
        }
      }

      if (reactive != null) {
        reactive.updateValueInternal(value);
      }
    };
    scheduleUpdate(emitAction);
  };

  return [event, emit];
}

export function never<A>(): Event<A> {
  return new EventImpl<A>(Future.never<A>());
}

export function empty<A>(): Event<A> {
  return never<A>();
}

export function subscribe<A>(ev: Event<A>, fn: (a: A) => void): () => void {
  const impl = ev as unknown as EventImpl<A>;
  try {
    return impl.future.run(fn);
  } catch (error) {
    console.error("Error in subscribe:", error);
    return () => {
      // No-op
    };
  }
}

export function onCleanup<A>(ev: Event<A>, fn: () => void): void {
  const impl = ev as unknown as EventImpl<A>;
  impl.internalAddCleanup(fn);
}

export function cleanup<A>(ev: Event<A>) {
  const impl = ev as unknown as EventImpl<A>;
  impl.internalCleanup();
}

export function map<A, B>(ev: Event<A>, f: (a: A) => B): Event<B> {
  const impl = ev as unknown as EventImpl<A>;
  return new EventImpl<B>(impl.future.map(f));
}

/**
 * Create a reactive value from this event
 * @param initialValue The initial value for the reactive
 */
export function stepper<A>(ev: Event<A>, initial: A): Reactive<A> {
  const impl = ev as unknown as EventImpl<A>;

  if (impl._stepper && impl._stepper.initial === initial) {
    return impl._stepper.reactive;
  }

  const reactive = R.create(initial, ev);
  impl._stepper = { reactive, initial };

  return reactive;
}

export function mergeWith<A, B, C>(
  ev: Event<A>,
  other: Event<B>,
  f: (a: A) => C,
  g: (b: B) => C,
): Event<C> {
  const future = new Future<C>((handler) => {
    // Subscribe to this event
    const sub0 = subscribe(ev, (a) => {
      try {
        handler(f(a));
      } catch (error) {
        console.error("Error in mergeWith handler:", error);
      }
    });

    // Subscribe to the other event
    const sub1 = subscribe(other, (b) => {
      try {
        handler(g(b));
      } catch (error) {
        console.error("Error in mergeWith handler:", error);
      }
    });

    // Return a function that unsubscribes from both
    return () => {
      sub0();
      sub1();
    };
  });
  return new EventImpl<C>(future);
}

export function concat<A>(e0: Event<A>, e1: Event<A>): Event<A> {
  return mergeWith(
    e0,
    e1,
    (a) => a,
    (b) => b,
  );
}

export function apply<A, B>(ev: Event<A>, rf: Reactive<(a: A) => B>): Event<B> {
  return map(ev, (a) => R.get(rf)(a));
}

export function tag<A, B>(ev: Event<A>, r: Reactive<B>): Event<B> {
  return map(ev, () => R.get(r));
}

/**
 * Filter this event based on a predicate
 */
export function filter<A>(
  ev: Event<A>,
  predicate: (a: A) => boolean,
): Event<A> {
  const impl = ev as unknown as EventImpl<A>;

  // Create a new future that filters the values
  const filteredFuture = impl.future.chain((a) => {
    // If the predicate passes, create a future with the value
    // Otherwise, create a "never" future that doesn't produce values
    try {
      return predicate(a) ? Future.of(a) : Future.never<A>();
    } catch (error) {
      console.error("Error in filter predicate:", error);
      return Future.never<A>();
    }
  });

  return new EventImpl<A>(filteredFuture);
}

export function filterApply<A>(
  ev: Event<A>,
  predicate: Reactive<(a: A) => boolean>,
): Event<A> {
  return filter(ev, (a) => R.get(predicate)(a));
}

export function when<A>(
  ev: Event<A>,
  predicate: Reactive<(a: A) => boolean>,
): Event<A> {
  return filter(ev, (a) => R.get(predicate)(a));
}

/**
 * Fold/accumulate values from this event
 */
export function fold<A, B>(
  ev: Event<A>,
  initial: B,
  f: (b: B, a: A) => B,
): Reactive<B> {
  // Create a reactive with the initial value
  const result = R.create<B>(initial);

  // Keep track of accumulated value
  let acc = initial;

  // Subscribe to this event
  const sub = subscribe(ev, (a) => {
    try {
      // Update accumulated value
      acc = f(acc, a);

      // Update reactive
      (result as R.ReactiveImpl<B>).updateValueInternal(acc);
    } catch (error) {
      console.error("Error in fold function:", error);
    }
  });

  R.onCleanup(result, sub);

  return result;
}

/**
 * Combine this event with another event into a paired event
 */
export function zip<A, B>(ev: Event<A>, other: Event<B>): Event<[A, B]> {
  // Create queues to store values from each source
  const queueA: A[] = [];
  const queueB: B[] = [];

  // Create a future that produces pairs
  const future = new Future<[A, B]>((handler) => {
    // Helper function to check and emit pairs
    const checkAndEmit = () => {
      // If we have values in both queues, emit a pair
      if (queueA.length > 0 && queueB.length > 0) {
        const a = queueA.shift()!;
        const b = queueB.shift()!;
        const pairValue: [A, B] = [a, b];
        handler(pairValue);
      }
    };

    // Subscribe to this event
    const subA = subscribe(ev, (a) => {
      // Add the new value to queue A
      queueA.push(a);
      // Try to emit a pair
      checkAndEmit();
    });

    // Subscribe to the other event
    const subB = subscribe(other, (b) => {
      // Add the new value to queue B
      queueB.push(b);
      // Try to emit a pair
      checkAndEmit();
    });

    // Return function that unsubscribes from both
    return () => {
      subA();
      subB();
      // Clear queues when unsubscribing
      queueA.length = 0;
      queueB.length = 0;
    };
  });

  return new EventImpl<[A, B]>(future);
}

export function batchCombine<A, B>(
  ev: Event<A>,
  other: Event<B>,
): Event<[A, B]> {
  const future = new Future<[A, B]>((handler) => {
    let pendingValueA: A | null = null;
    let pendingValueB: B | null = null;
    let hasValueA = false;
    let hasValueB = false;
    let scheduledCheck = false;

    const checkAndEmit = () => {
      scheduledCheck = false;
      if (hasValueA && hasValueB) {
        handler([pendingValueA!, pendingValueB!]);
        pendingValueA = null;
        pendingValueB = null;
        hasValueA = false;
        hasValueB = false;
      }
    };

    // Use queueMicrotask directly instead of batch-related functions
    const scheduleCheck = () => {
      if (!scheduledCheck) {
        scheduledCheck = true;
        queueMicrotask(checkAndEmit);
      }
    };

    const subA = subscribe(ev, (a) => {
      pendingValueA = a;
      hasValueA = true;
      scheduleCheck();
    });

    const subB = subscribe(other, (b) => {
      pendingValueB = b;
      hasValueB = true;
      scheduleCheck();
    });

    return () => {
      subA();
      subB();
    };
  });

  return new EventImpl<[A, B]>(future);
}

/**
 * Create a debounced event that only triggers after input stops
 */
export function debounce<A>(ev: Event<A>, ms: number = 249): Event<A> {
  let timeoutId: number | null = null;
  let latestValue: A | null = null;
  let hasValue = false;

  return new EventImpl<A>(
    new Future<A>((handler) => {
      const subscription = subscribe(ev, (value) => {
        latestValue = value;
        hasValue = true;

        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }

        timeoutId = window.setTimeout(() => {
          if (hasValue && latestValue !== null) {
            handler(latestValue);
          }
          timeoutId = null;
        }, ms);
      });

      return () => {
        subscription();
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };
    }),
  );
}

/**
 * Create a throttled event that only triggers at most once per interval
 */
export function throttle<A>(ev: Event<A>, ms: number = 249): Event<A> {
  let lastFireTime = -1;
  let timeoutId: number | null = null;
  let latestValue: A | null = null;
  let hasValue = false;

  return new EventImpl<A>(
    new Future<A>((handler) => {
      const subscription = subscribe(ev, (value) => {
        const now = Date.now();
        latestValue = value;
        hasValue = true;

        if (now - lastFireTime >= ms) {
          // Enough time has passed since last emission
          lastFireTime = now;
          handler(value);
          hasValue = false;
        } else if (timeoutId === null) {
          // Schedule a future emission
          timeoutId = window.setTimeout(
            () => {
              if (hasValue && latestValue !== null) {
                lastFireTime = Date.now();
                handler(latestValue);
              }
              timeoutId = null;
              hasValue = false;
            },
            ms - (now - lastFireTime),
          );
        }
      });

      return () => {
        subscription();
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };
    }),
  );
}

export function zipAll<T extends any[]>(
  ...events: { [K in keyof T]: Event<T[K]> }
): Event<T> {
  if (events.length === 0) {
    throw new Error("zipAll requires at least one event");
  }

  if (events.length === 1) {
    return map(events[0], (value) => [value] as unknown as T);
  }

  let result = map(
    zip(events[0], events[1]),
    ([a, b]) => [a, b] as unknown as T,
  );

  for (let i = 2; i < events.length; i++) {
    result = map(
      zip(result, events[i]),
      ([tuple, next]) => [...(tuple as any[]), next] as unknown as T,
    );
  }

  return result;
}

export function switchE<A>(
  initialEvent: Event<A>,
  eventOfEvents: Event<Event<A>>,
): Event<A> {
  // Create a new event that will emit values from the current source
  const [resultEvent, emitResult] = create<A>();

  // Keep track of the current source and its subscription
  let currentEvent = initialEvent;
  let currentSubscription = subscribe(currentEvent, emitResult);

  // Subscribe to the event of events
  const eventsSubscription = subscribe(eventOfEvents, (newEvent) => {
    // Clean up the subscription to the previous event
    if (currentSubscription) {
      currentSubscription();
    }

    cleanup(currentEvent);

    // Update the current event and subscribe to it
    currentEvent = newEvent;
    currentSubscription = subscribe(currentEvent, emitResult);
  });

  onCleanup(resultEvent, () => {
    if (currentSubscription) {
      currentSubscription();
    }
    eventsSubscription();
    cleanup(eventOfEvents);
    cleanup(currentEvent);
  });

  return resultEvent;
}

export function switchE1<A>(
  initialEvent: Event<A>,
  eventOfEvents: Event<Event<A>>,
): Event<A> {
  // Create a new event to act as the merged stream
  const [resultEvent, emitResult] = create<A>();

  // Keep track of the current event and subscription
  let currentEvent = initialEvent;
  let currentSubscription: (() => void) | null = null;

  // Function to subscribe to the current event
  const subscribeToCurrentEvent = () => {
    // Clean up previous subscription if it exists
    if (currentSubscription) {
      currentSubscription();
      currentSubscription = null;
    }

    // Create a new subscription to the current event
    currentSubscription = subscribe(currentEvent, (value) => {
      emitResult(value);
    });
  };

  // Initially subscribe to the current event
  subscribeToCurrentEvent();

  // Subscribe to the event of events
  const eventsSubscription = subscribe(eventOfEvents, (newEvent) => {
    // Update the current event
    currentEvent = newEvent;

    // Subscribe to the new event
    subscribeToCurrentEvent();
  });

  // Add cleanup function to the result event
  onCleanup(resultEvent, () => {
    if (currentSubscription) {
      currentSubscription();
      currentSubscription = null;
    }

    eventsSubscription();
  });

  return resultEvent;
}

export function accum<A>(initial: A, ef: Event<(a: A) => A>): Event<A> {
  let state = initial;
  return map(ef, (f) => {
    state = f(state);
    return state;
  });
}

export function unions<A>(efs: Event<(a: A) => A>[]): Event<(a: A) => A> {
  return efs.reduce((acc, ef) => {
    return mergeWith(
      acc,
      ef,
      (a) => a,
      (a) => a,
    );
  }, never<(a: A) => A>());
}

