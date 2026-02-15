// import { EventImpl, subscribe as subscribeEvent } from "./event";
import type { Event } from "./event";
import * as E from "./event";
import { Future } from "./future";
import { scheduleUpdate } from "./batch";
import {
    trackDisposerInCurrentScope,
    trackReactiveInCurrentScope,
} from "./scope";

type ReactiveDebugStats = {
    created: number;
    cleaned: number;
};

const reactiveDebugStats: ReactiveDebugStats = {
    created: 0,
    cleaned: 0,
};

export interface Reactive<A> {
    readonly __impl__: true;
    readonly __tag__: "Reactive";
    /**
     * Event stream of changes to this Reactive.
     * Does NOT include the initial value - only fires when the value changes.
     * Use with E.effect to run side effects on changes without initial firing.
     *
     * @example
     * const count = E.fold(increment, 0, (c) => c + 1);
     * E.effect(count.changes, (n) => console.log('Count changed to:', n));
     * // Only logs when count actually changes, not on initialization
     */
    readonly changes: Event<A>;
}

export interface InternalReactive<A> extends Reactive<A> {
    currentValue: A;
    changeEvent?: Event<A>;
    subscribers: Array<(value: A) => void>;
    cleanupFns: Set<() => void>;
    mapDerivation?: {
        source: InternalReactive<any>;
        map: (value: any) => A;
        teardown?: () => void;
    };
    readonly changes: Event<A>;
    updateValueInternal(newValue: A): void;
    /**
     * Subscribe to changes with control over immediate notification (only for Future to call)
     * @internal
     */
    subscribeInternal(
        handler: (value: A) => void,
        notifyWithCurrent: boolean,
    ): () => void;
}

export class ReactiveImpl<A> implements InternalReactive<A> {
    readonly __impl__ = true;
    readonly __tag__ = "Reactive";
    currentValue: A;
    changeEvent?: Event<A>;
    mapDerivation?: {
        source: InternalReactive<any>;
        map: (value: any) => A;
        teardown?: () => void;
    };
    subscribers: Array<(value: A) => void> = [];
    cleanupFns: Set<() => void> = new Set();
    private __debugCleaned = false;

    constructor(initialValue: A, changeEvent?: Event<A>) {
        reactiveDebugStats.created += 1;
        this.currentValue = initialValue;
        this.changeEvent = changeEvent;
        trackReactiveInCurrentScope(this);

        if (changeEvent) {
            const unsub = E.subscribe(changeEvent, (v) => {
                this.updateValueInternal(v);
            });
            this.cleanupFns.add(unsub);
        }
    }

    /**
     * Get the changes event stream for this reactive.
     * Lazily creates the event if it doesn't exist.
     */
    get changes(): Event<A> {
        if (!this.changeEvent) {
            this.changeEvent = new E.EventImpl(Future.fromReactive(this));
        }
        return this.changeEvent;
    }

    updateValueInternal(newValue: A): void {
        this.currentValue = newValue;
        const subscribers = this.subscribers;
        const len = subscribers.length;

        if (len === 0) return;

        if (len === 1) {
            try {
                subscribers[0](newValue);
            } catch (e) {
                console.error("subscriber error:", e);
            }
            return;
        }

        for (let i = 0; i < len; i++) {
            const sub = subscribers[i];
            try {
                sub(newValue);
            } catch (e) {
                console.error("subscriber error:", e);
            }
        }
    }

    internalAddCleanup(fn: () => void) {
        this.cleanupFns.add(fn);
    }

    /**
     * Internal method to subscribe to changes with control over immediate notification
     * @internal
     */
    subscribeInternal(
        handler: (value: A) => void,
        notifyWithCurrent: boolean,
    ): () => void {
        // For map derivations, subscribe to source and compose the transformation
        // This avoids calling updateValueInternal and creates a flat function chain
        if (this.mapDerivation) {
            const derivation = this.mapDerivation;
            const unsub = derivation.source.subscribeInternal((value) => {
                const mapped = derivation.map(value);
                this.currentValue = mapped;
                handler(mapped);
            }, false);
            return unsub;
        }

        const subscribers = this.subscribers;
        subscribers.push(handler);

        // Call immediately with current value if requested
        if (notifyWithCurrent) {
            handler(this.currentValue);
        }

        // Return unsubscribe function
        return () => {
            const idx = subscribers.indexOf(handler);
            if (idx >= 0) {
                subscribers.splice(idx, 1);
            }

            if (subscribers.length === 0 && this.mapDerivation?.teardown) {
                this.mapDerivation.teardown();
            }
        };
    }
}

export function isReactive<T>(value: unknown): value is Reactive<T> {
    return (value as any)?.__tag__ === "Reactive";
}

export function create<A>(value: A, event?: Event<A>): Reactive<A> {
    return new ReactiveImpl(value, event);
}

export function of<A>(value: A): Reactive<A> {
    return new ReactiveImpl(value);
}

export function get<A>(r: Reactive<A>): A {
    const impl = r as InternalReactive<A>;
    if (impl.mapDerivation && !impl.mapDerivation.teardown) {
        const sourceValue = get(impl.mapDerivation.source as Reactive<any>);
        impl.currentValue = impl.mapDerivation.map(sourceValue);
    }
    return impl.currentValue;
}

export function subscribe<A>(
    r: Reactive<A>,
    fn: (value: A) => void,
): () => void {
    const impl = r as InternalReactive<A>;

    // Subscribe to the change event
    const eventUnsub = E.subscribe(r.changes, fn);

    // Call immediately with current value
    fn(get(r));

    // Add to cleanup functions
    impl.cleanupFns.add(eventUnsub);

    return eventUnsub;
}

/**
 * Get the current value of a Reactive once (non-reactive read).
 * This is an alias for `get()` with a more intuitive name.
 * Use sparingly - prefer reactive composition with E.sample or E.snapshot.
 *
 * @example
 * const currentCount = R.sample(count);
 */
export function sample<A>(r: Reactive<A>): A {
    return (r as InternalReactive<A>).currentValue;
}

export function onCleanup<A>(ev: Reactive<A>, fn: () => void): void {
    const impl = ev as InternalReactive<A>;
    impl.cleanupFns.add(fn);
}

export function cleanup<A>(r: Reactive<A>) {
    const impl = r as InternalReactive<A> & { __debugCleaned?: boolean };
    if (!impl.__debugCleaned) {
        impl.__debugCleaned = true;
        reactiveDebugStats.cleaned += 1;
    }
    for (const fn of impl.cleanupFns) {
        try {
            fn();
        } catch (e) {
            console.error("cleanup failed", e);
        }
    }
    impl.cleanupFns.clear();
    impl.subscribers = [];
}

export function map<A, B>(r: Reactive<A>, fn: (a: A) => B): Reactive<B> {
    const source = r as InternalReactive<A>;
    const baseSource = source.mapDerivation?.source ?? source;
    const sourceMap =
        source.mapDerivation?.map ?? ((value: A) => value as unknown as A);
    const fusedMap = (value: any) => fn(sourceMap(value));
    const result = new ReactiveImpl(fn(get(r)));
    result.mapDerivation = {
        source: baseSource,
        map: fusedMap,
    };
    return result as Reactive<B>;
}

function mapSpec<A, B>(r: Reactive<A>, fn: (a: A) => B): Reactive<B> {
    return create(fn(get(r)), E.map(r.changes, fn));
}

function chainSpec<A, B>(
    r: Reactive<A>,
    fn: (a: A) => Reactive<B>,
): Reactive<B> {
    const initialInner = fn(get(r));
    const innerChanges = mapSpec(r, (a) => fn(a).changes);
    const switchedInnerChanges = E.switchR(innerChanges);
    const outerSnapshots = E.map(r.changes, (a) => get(fn(a)));
    const combinedChanges = E.mergeWith(
        outerSnapshots,
        switchedInnerChanges,
        (value) => value,
        (value) => value,
    );
    const result = create(get(initialInner), combinedChanges);

    onCleanup(result, () => {
        cleanup(innerChanges);
    });

    return result;
}

export const __private__ = {
    mapSpec,
    chainSpec,
    debugStats: () => ({ ...reactiveDebugStats }),
    resetDebugStats: () => {
        reactiveDebugStats.created = 0;
        reactiveDebugStats.cleaned = 0;
    },
};

export function ap1<A, B>(
    r: Reactive<A>,
    rf: Reactive<(a: A) => B>,
): Reactive<B> {
    // Get initial value
    const initialValue = get(rf)(get(r));

    // Get change events for both reactives
    const aChanges = r.changes;
    const fChanges = rf.changes;

    // Create transform functions for mergeWith
    const whenValueChanges = (a: A) => get(rf)(a);
    const whenFunctionChanges = (f: (a: A) => B) => f(get(r));

    // Use mergeWith to combine both change events
    const combinedEvent = E.mergeWith(
        aChanges,
        fChanges,
        whenValueChanges,
        whenFunctionChanges
    );

    // Create a new reactive with the initial value and combined event
    return create(initialValue, combinedEvent);
}

export function ap<A, B>(
    r: Reactive<A>,
    rf: Reactive<(a: A) => B>,
): Reactive<B> {
    const result = new ReactiveImpl(get(rf)(get(r)));

    const sub1 = subscribe(r, (a) => {
        result.currentValue = get(rf)(a);
        result.subscribers.forEach((fn) => fn(result.currentValue));
    });

    const sub2 = subscribe(rf, (f) => {
        result.currentValue = f(get(r));
        result.subscribers.forEach((fn) => fn(result.currentValue));
    });

    result.cleanupFns.add(sub1);
    result.cleanupFns.add(sub2);
    return result as Reactive<B>;
}

export function chain<A, B>(
    r: Reactive<A>,
    fn: (a: A) => Reactive<B>,
): Reactive<B> {
    let inner = fn(get(r));
    const result = new ReactiveImpl(get(inner));

    let innerUnsub = subscribe(inner, (b) => {
        result.currentValue = b;
        result.subscribers.forEach((f) => f(b));
    });

    const outerUnsub = subscribe(r, (a) => {
        innerUnsub(); // cleanup previous inner
        inner = fn(a);
        result.currentValue = get(inner);
        innerUnsub = subscribe(inner, (b) => {
            result.currentValue = b;
            result.subscribers.forEach((f) => f(b));
        });
    });

    result.cleanupFns.add(innerUnsub);
    result.cleanupFns.add(outerUnsub);
    return result as Reactive<B>;
}

export function mapEachReactive<A, B>(
    arr: Reactive<ReadonlyArray<A>>,
    fn: (a: A) => B,
): Reactive<ReadonlyArray<B>> {
    // Use lazy derivation pattern like R.map
    return map(arr, (items) => items.map(fn));
}

/**
 * @deprecated Use E.effect(reactive.changes, fn) instead for explicit handling of changes.
 * This function fires on both initial value and changes. For change-only effects, use:
 *
 *   E.effect(reactive.changes, fn);
 *
 * For initial + changes (same as this function):
 *
 *   fn(R.sample(reactive));
 *   E.effect(reactive.changes, fn);
 */
export function effect<A>(r: Reactive<A>, fn: (a: A) => void): () => void {
    return effectPostFlush(r, fn);
}

export function effectPostFlush<A>(r: Reactive<A>, fn: (a: A) => void): () => void {
    let disposed = false;
    let scheduled = false;

    const unsub = subscribe(r, () => {
        if (disposed || scheduled) return;

        scheduled = true;
        scheduleUpdate(() => {
            queueMicrotask(() => {
                scheduled = false;
                if (disposed) return;
                fn(get(r));
            });
        });
    });

    return trackDisposerInCurrentScope(() => {
        disposed = true;
        unsub();
    });
}
