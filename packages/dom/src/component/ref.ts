import { Event } from "@synx/frp/event";
import { Reactive } from "@synx/frp/reactive";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { distinct } from "@synx/dsl/stream";

/** ---------- Single Ref ---------- */

export type RefObject<T> = {
  /** Reactive holder of the referenced value (null until set). */
  ref: Reactive<T | null>;
  /** Push a new value into the ref. */
  set: (val: T) => void;
  /** Convenient getter (throws if null). */
  get: () => T;
  /** Current snapshot (no tracking). */
  current: () => T | null;
};

export function Ref<T>(): RefObject<T> {
  const [ev, emit] = E.create<T>();
  const ref = E.stepper(ev, null as T | null);
  return {
    ref,
    set: emit,
    get: () => {
      const v = R.get(ref);
      if (v == null) throw new Error("Ref not ready");
      return v;
    },
    current: () => R.get(ref),
  } as const;
}

/** ---------- Ref Map (keyed refs) ---------- */

export type RefMapObject<K, T> = {
  map: Reactive<Map<K, T | null>>;
  get: (key: K) => RefObject<T>;
  set: (key: K, value: T) => void;
  delete: (key: K) => void;
  values: () => Reactive<Array<T | null>>;
  keys: () => Reactive<Array<K>>;
  entries: () => Reactive<Array<[K, T | null]>>;
  size: Reactive<number>;
  forEach: (callback: (value: T | null, key: K) => void) => void;
  clear: () => void;
};

export function RefMap<K, T>(): RefMapObject<K, T> {
  const [mapEvent, emitMapUpdate] = E.create<Map<K, T | null>>();
  const reactiveMap = E.stepper(mapEvent, new Map<K, T | null>());

  const set = (key: K, value: T) => {
    const next = new Map(R.get(reactiveMap));
    next.set(key, value);
    emitMapUpdate(next);
  };

  const get = (key: K): RefObject<T> => {
    const keyRef = R.map(reactiveMap, (m) => m.get(key) ?? null);
    return {
      ref: keyRef,
      set: (v: T) => set(key, v),
      get: () => {
        const v = R.get(keyRef);
        if (v == null) throw new Error(`RefMap[${String(key)}] not ready`);
        return v;
      },
      current: () => R.get(keyRef),
    };
  };

  const deleteKey = (key: K) => {
    const next = new Map(R.get(reactiveMap));
    next.delete(key);
    emitMapUpdate(next);
  };

  const clear = () => emitMapUpdate(new Map<K, T | null>());

  const values = () => R.map(reactiveMap, (m) => Array.from(m.values()));
  const keys = () => R.map(reactiveMap, (m) => Array.from(m.keys()));
  const entries = () =>
    R.map(reactiveMap, (m) => Array.from(m.entries() as Iterable<[K, T | null]>));
  const size = R.map(reactiveMap, (m) => m.size);

  return {
    map: reactiveMap,
    get,
    set,
    delete: deleteKey,
    clear,
    values,
    keys,
    entries,
    size,
    forEach: (cb) => {
      const m = R.get(reactiveMap);
      m.forEach((v, k) => cb(v, k));
    },
  };
}

/** ---------- Outputs wiring ---------- */

export const refOutput = <T>(
  // r: { ref: Reactive<{ outputs?: Record<string, Event<any>> } | null | undefined> },
  r: RefObject<{ outputs?: Record<string, Event<any>> }>,
  n: string,
  defaultValue?: T
): Event<T> => {
  const fallback = defaultValue !== undefined ? E.of(defaultValue) : E.never<T>();

  // Reactive<Event<T>> that follows r.ref?.outputs[n] (or fallback)
  const outputEvR: Reactive<Event<T>> = R.map(r.ref, (v) => {
    const e = v?.outputs?.[n] as Event<T> | undefined;
    return e ?? fallback;
  });

  // Emit the active event whenever the selection changes
  const [eventOfEvents, emitEvent] = E.create<Event<T>>();

  // Use distinct to avoid emitting the same event instance repeatedly
  R.effect(distinct(outputEvR), (e: Event<T>) => emitEvent(e));

  // Switch into whatever event is current; start from fallback
  return E.switchE(fallback, eventOfEvents);
};

/** Reactive array of output events from a RefMap (per key). */
export const refMapOutputs = <
  K,
  T extends { outputs?: Record<string, Event<any>> },
  O = any
>(
  r: RefMapObject<K, T>,
  n: string,
  defaultValue?: O
): Reactive<Event<O>[]> => {
  const fallback = defaultValue !== undefined ? E.of(defaultValue) : E.never<O>();
  return R.map(r.values(), (arr) =>
    (arr || [])
      .filter(Boolean)
      .map((c) => (c!.outputs?.[n] as Event<O> | undefined) ?? fallback)
  );
};
