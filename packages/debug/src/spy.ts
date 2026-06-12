import type { Event } from "@synx/frp/event";
import type { Reactive } from "@synx/frp/reactive";
import { isReactive, get, subscribe as subscribeReactive } from "@synx/frp/reactive";
import { subscribe as subscribeEvent } from "@synx/frp/event";

export interface EventSpy<A> {
  /** All values emitted since creation or last reset */
  readonly values: ReadonlyArray<A>;
  /** The most recent emitted value, or undefined if none */
  readonly lastValue: A | undefined;
  /** Number of emissions */
  readonly count: number;
  /** Whether the event has fired at least once */
  readonly called: boolean;
  /** Stop recording */
  dispose(): void;
  /** Clear recorded values */
  reset(): void;
}

export interface ReactiveSpy<A> {
  /** Current value of the reactive */
  readonly value: A;
  /** History of all values (starting with initial, then each change) */
  readonly history: ReadonlyArray<A>;
  /** Number of changes (excludes initial value) */
  readonly changeCount: number;
  /** Stop recording */
  dispose(): void;
  /** Clear history (keeps current value as new starting point) */
  reset(): void;
}

export function spyEvent<A>(event: Event<A>): EventSpy<A> {
  const values: A[] = [];
  let disposed = false;

  const unsub = subscribeEvent(event, (value) => {
    if (!disposed) {
      values.push(value);
    }
  });

  return {
    get values() { return values; },
    get lastValue() { return values.length > 0 ? values[values.length - 1] : undefined; },
    get count() { return values.length; },
    get called() { return values.length > 0; },
    dispose() {
      disposed = true;
      unsub();
    },
    reset() {
      values.length = 0;
    },
  };
}

export function spyReactive<A>(reactive: Reactive<A>): ReactiveSpy<A> {
  const history: A[] = [get(reactive)];
  let disposed = false;

  // Subscribe to changes only (not initial value, which we already captured)
  const unsub = subscribeEvent(reactive.changes, (value: A) => {
    if (!disposed) {
      history.push(value);
    }
  });

  return {
    get value() { return get(reactive); },
    get history() { return history; },
    get changeCount() { return history.length - 1; },
    dispose() {
      disposed = true;
      unsub();
    },
    reset() {
      history.length = 0;
      history.push(get(reactive));
    },
  };
}

export function spy<A>(target: Event<A>): EventSpy<A>;
export function spy<A>(target: Reactive<A>): ReactiveSpy<A>;
export function spy<A>(target: Event<A> | Reactive<A>): EventSpy<A> | ReactiveSpy<A> {
  if (isReactive(target)) {
    return spyReactive(target as Reactive<A>);
  }
  return spyEvent(target as Event<A>);
}
