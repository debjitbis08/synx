import inspector from 'node:inspector';
import * as E from '../src/event';
import * as R from '../src/reactive';
import type { Event } from '../src/event';
import type { Reactive } from '../src/reactive';

export const CYCLES = 14;
const WARMUP_CYCLES = 4;
const WINDOW = 4;
const ABSOLUTE_DRIFT_LIMIT_BYTES = 8 * 1024 * 1024;
const RELATIVE_DRIFT_LIMIT = 0.15;
const OUTSTANDING_OBJECT_LIMIT = 64;

const globalWithGc = globalThis as typeof globalThis & {
  gc?: () => void;
};

const gc = globalWithGc.gc;
let inspectorSession: inspector.Session | null = null;

const flushMicrotasks = () =>
  new Promise<void>((resolve) => {
    Promise.resolve().then(() => resolve());
  });

const forceGc = async () => {
  for (let i = 0; i < 3; i++) {
    if (gc) {
      gc();
    } else {
      if (!inspectorSession) {
        inspectorSession = new inspector.Session();
        inspectorSession.connect();
      }
      await new Promise<void>((resolve, reject) => {
        inspectorSession!.post('HeapProfiler.collectGarbage', (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    await flushMicrotasks();
  }
};

const average = (values: number[]) => {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return sum / values.length;
};

const getHeapDrift = (heapSamples: number[]) => {
  const baseline = average(
    heapSamples.slice(WARMUP_CYCLES, WARMUP_CYCLES + WINDOW),
  );
  const tail = average(heapSamples.slice(-WINDOW));
  const drift = tail - baseline;
  const driftLimit = Math.max(
    ABSOLUTE_DRIFT_LIMIT_BYTES,
    baseline * RELATIVE_DRIFT_LIMIT,
  );

  return {
    drift,
    baseline,
    tail,
    driftLimit,
    exceedsLimit: drift > driftLimit,
  };
};

const getDebugOutstanding = () => {
  const eventStats = E.__private__.debugStats();
  const reactiveStats = R.__private__.debugStats();
  const outstandingEvents = eventStats.created - eventStats.cleaned;
  const outstandingReactives = reactiveStats.created - reactiveStats.cleaned;

  return {
    eventStats,
    reactiveStats,
    outstandingEvents,
    outstandingReactives,
    exceedsLimit:
      outstandingEvents > OUTSTANDING_OBJECT_LIMIT ||
      outstandingReactives > OUTSTANDING_OBJECT_LIMIT,
  };
};

export interface LeakProbeResult {
  label: string;
  elapsedMs: number;
  heapDriftBytes: number;
  heapBaselineBytes: number;
  heapTailBytes: number;
  heapDriftLimitBytes: number;
  heapExceeded: boolean;
  outstandingEvents: number;
  outstandingReactives: number;
  outstandingExceeded: boolean;
  leakFlag: boolean;
  score: number;
}

const runLeakProbe = async (
  label: string,
  runCycle: () => Promise<void> | void,
): Promise<LeakProbeResult> => {
  E.__private__.resetDebugStats();
  R.__private__.resetDebugStats();
  const heapSamples: number[] = [];
  const startedAt = Date.now();

  for (let cycle = 0; cycle < CYCLES; cycle++) {
    await runCycle();
    await forceGc();
    heapSamples.push(process.memoryUsage().heapUsed);
  }

  const heap = getHeapDrift(heapSamples);
  const outstanding = getDebugOutstanding();
  const leakFlag = heap.exceedsLimit || outstanding.exceedsLimit;
  const score =
    (leakFlag ? 1_000_000_000 : 0) +
    Math.max(0, heap.drift) +
    outstanding.outstandingEvents +
    outstanding.outstandingReactives;

  return {
    label,
    elapsedMs: Date.now() - startedAt,
    heapDriftBytes: heap.drift,
    heapBaselineBytes: heap.baseline,
    heapTailBytes: heap.tail,
    heapDriftLimitBytes: heap.driftLimit,
    heapExceeded: heap.exceedsLimit,
    outstandingEvents: outstanding.outstandingEvents,
    outstandingReactives: outstanding.outstandingReactives,
    outstandingExceeded: outstanding.exceedsLimit,
    leakFlag,
    score,
  };
};

const runEventCycle = async () => {
  const allEvents: Event<number>[] = [];
  const cleanupFns: Array<() => void> = [];
  const roots: Array<{ event: Event<number>; emit: (value: number) => void }> = [];

  for (let i = 0; i < 8; i++) {
    const [event, emit] = E.create<number>();
    roots.push({ event, emit });
    allEvents.push(event);

    let current = event;
    for (let d = 0; d < 24; d++) {
      current =
        d % 2 === 0
          ? E.map(current, (value) => value + d)
          : E.filter(current, (value) => (value & 1) === 0);
      allEvents.push(current);
    }
    cleanupFns.push(E.subscribe(current, () => {}));
  }

  const merged = E.mergeAll(allEvents);
  allEvents.push(merged);
  cleanupFns.push(E.subscribe(merged, () => {}));

  for (let i = 0; i < roots.length; i++) {
    for (let n = 0; n < 32; n++) {
      roots[i].emit(n + i);
    }
  }
  await flushMicrotasks();

  for (let i = 0; i < cleanupFns.length; i++) cleanupFns[i]();
  for (let i = 0; i < allEvents.length; i++) E.cleanup(allEvents[i]);
};

const runReactiveCycle = async () => {
  const root = R.create(0);
  const nodes: Reactive<number>[] = [root];

  let current = root;
  for (let i = 0; i < 256; i++) {
    current = R.map(current, (value) => value + i);
    nodes.push(current);
  }

  for (let i = 0; i < 64; i++) {
    (root as any).updateValueInternal(i);
  }
  await flushMicrotasks();

  for (let i = 0; i < nodes.length; i++) R.cleanup(nodes[i]);
};

const runMixedOperatorCycle = async () => {
  const sources: Array<{ event: Event<number>; emit: (value: number) => void }> = [];
  const events: Event<unknown>[] = [];
  const reactives: Reactive<number>[] = [];

  const leaves: Reactive<number>[] = [];
  for (let i = 0; i < 6; i++) {
    const [event, emit] = E.create<number>();
    sources.push({ event, emit });
    events.push(event);

    const mapped = E.map(event, (value) => value + i);
    const filtered = E.filter(mapped, (value) => value % 3 !== 0);
    events.push(mapped, filtered);

    const folded = E.fold(filtered, 0, (acc, value) => acc + value);
    reactives.push(folded);
    leaves.push(folded);
  }

  let aggregate = R.of(0);
  reactives.push(aggregate);
  for (let i = 0; i < leaves.length; i++) {
    const addRight = R.map(aggregate, (left) => (right: number) => left + right);
    reactives.push(addRight);
    aggregate = R.ap(leaves[i], addRight);
    reactives.push(aggregate);
  }

  for (let i = 0; i < sources.length; i++) {
    for (let n = 0; n < 40; n++) {
      sources[i].emit(n);
    }
  }
  await flushMicrotasks();

  for (let i = 0; i < reactives.length; i++) R.cleanup(reactives[i]);
  for (let i = 0; i < events.length; i++) E.cleanup(events[i] as Event<number>);
};

export const leakProbes: Array<{
  name: string;
  run: () => Promise<LeakProbeResult>;
}> = [
  {
    name: 'event graph create/destroy in loops',
    run: () => runLeakProbe('event graph', runEventCycle),
  },
  {
    name: 'reactive graph create/destroy in loops',
    run: () => runLeakProbe('reactive graph', runReactiveCycle),
  },
  {
    name: 'mixed operator graph create/destroy in loops',
    run: () => runLeakProbe('mixed operator graph', runMixedOperatorCycle),
  },
];
