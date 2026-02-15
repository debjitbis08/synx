import { Event } from "@synx/frp/event";
import { Reactive } from "@synx/frp/reactive";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { distinct } from "@synx/dsl/stream";
import { subscribe } from "../../../frp/src/event";

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
  /** Event outputs derived from the current ref target (DOM or component outputs). */
  outputs: RefOutputs;
};

export type RefOutputs = Record<string, Event<any>> & {
  [K in keyof GlobalEventHandlersEventMap]: Event<GlobalEventHandlersEventMap[K]>;
};

function createOutputsProxy(r: RefObject<any>): RefOutputs {
  const cache = new Map<string, Event<any>>();
  return new Proxy({} as RefOutputs, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      const cached = cache.get(prop);
      if (cached) return cached;
      const output = refOutput(r as RefObject<any>, prop as any);
      cache.set(prop, output);
      return output;
    },
  });
}

export function Ref<T>(): RefObject<T> {
  const [ev, emit] = E.create<T>();
  const ref = E.stepper(ev, null as T | null);
  const refObject = {
    ref,
    set: emit,
    get: () => {
      const v = R.get(ref);
      if (v == null) throw new Error("Ref not ready");
      return v;
    },
    current: () => R.get(ref),
    outputs: {} as RefOutputs,
  } as RefObject<T>;
  refObject.outputs = createOutputsProxy(refObject);
  return refObject;
}

export const windowRef: RefObject<EventTarget> = Ref<EventTarget>();
if (typeof window !== "undefined") {
  windowRef.set(window);
}

export const documentRef: RefObject<EventTarget> = Ref<EventTarget>();
if (typeof document !== "undefined") {
  documentRef.set(document);
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
  const mapState = new Map<K, T | null>();
  const reactiveMap = E.stepper(mapEvent, mapState);

  const set = (key: K, value: T) => {
    mapState.set(key, value);
    emitMapUpdate(mapState);
  };

  const get = (key: K): RefObject<T> => {
    const keyRef = R.map(reactiveMap, (m) => m.get(key) ?? null);
    const refObject = {
      ref: keyRef,
      set: (v: T) => set(key, v),
      get: () => {
        const v = R.get(keyRef);
        if (v == null) throw new Error(`RefMap[${String(key)}] not ready`);
        return v;
      },
      current: () => R.get(keyRef),
      outputs: {} as RefOutputs,
    } as RefObject<T>;
    refObject.outputs = createOutputsProxy(refObject);
    return refObject;
  };

  const deleteKey = (key: K) => {
    const deleted = mapState.delete(key);
    if (deleted) {
      emitMapUpdate(mapState);
    }
  };

  const clear = () => {
    if (mapState.size === 0) return;
    mapState.clear();
    emitMapUpdate(mapState);
  };

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
      mapState.forEach((v, k) => cb(v, k));
    },
  };
}

/** ---------- Outputs wiring ---------- */

export function refOutput<
  TTarget extends EventTarget,
  K extends keyof GlobalEventHandlersEventMap
>(
  r: RefObject<TTarget>,
  n: K,
): Event<GlobalEventHandlersEventMap[K]>;
export function refOutput<T>(
  r: RefObject<{ outputs?: Record<string, Event<any>> }>,
  n: string,
  defaultValue?: T
): Event<T>;
export function refOutput(
  r: RefObject<any>,
  n: string,
  defaultValue?: unknown
): Event<any> {
  const fallback =
    defaultValue !== undefined ? E.of(defaultValue) : E.never<any>();

  // DOM output stream stays inert until ref points to an EventTarget, then
  // starts forwarding that DOM event. It auto-detaches when target changes.
  const domOutput = refDomEvent(
    r as unknown as RefObject<EventTarget>,
    n as keyof GlobalEventHandlersEventMap
  );

  // Reactive<Event<any>> that follows current ref target:
  // - EventTarget -> DOM event stream
  // - component-like output carrier -> named output
  // - otherwise -> fallback
  const outputEvR: Reactive<Event<any>> = R.map(r.ref, (v) => {
    if (isEventTarget(v)) return domOutput;
    if (isOutputCarrier(v)) return v.outputs?.[n] ?? fallback;
    return fallback;
  });

  // Emit the active event whenever the selection changes
  const [eventOfEvents, emitEvent] = E.create<Event<any>>();

  // Use distinct to avoid emitting the same event instance repeatedly
  const distinctOutput = distinct(outputEvR);
  emitEvent(R.get(distinctOutput)); // Emit initial value
  subscribe(distinctOutput.changes, (e: Event<any>) => emitEvent(e));

  // Switch into whatever event is current; start from fallback
  return E.switchE(fallback, eventOfEvents);
}

export function refDomEvent<K extends keyof GlobalEventHandlersEventMap>(
  r: RefObject<EventTarget>,
  n: K
): Event<GlobalEventHandlersEventMap[K]> {
  const [event, emit] = E.create<GlobalEventHandlersEventMap[K]>();
  let removeCurrent: (() => void) | null = null;

  const handleRefChange = (target: EventTarget | null) => {
    if (removeCurrent) {
      removeCurrent();
      removeCurrent = null;
    }

    if (
      target == null ||
      typeof (target as any).addEventListener !== "function" ||
      typeof (target as any).removeEventListener !== "function"
    ) {
      return;
    }

    const handler = (value: globalThis.Event) => {
      emit(value as unknown as GlobalEventHandlersEventMap[K]);
    };

    (target as any).addEventListener(n, handler);
    removeCurrent = () => {
      (target as any).removeEventListener(n, handler);
    };
  };

  // Handle initial ref value
  handleRefChange(R.get(r.ref));

  // Subscribe to ref changes
  const stopRefWatch = subscribe(r.ref.changes, handleRefChange);

  E.onCleanup(event, () => {
    stopRefWatch();
    if (removeCurrent) {
      removeCurrent();
      removeCurrent = null;
    }
  });

  return event;
}

function isEventTarget(value: unknown): value is EventTarget {
  return (
    value != null &&
    typeof (value as any).addEventListener === "function" &&
    typeof (value as any).removeEventListener === "function"
  );
}

function isOutputCarrier(
  value: unknown
): value is { outputs?: Record<string, Event<any>> } {
  return value != null && typeof value === "object" && "outputs" in value;
}

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
