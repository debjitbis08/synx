import { bench, describe } from 'vitest';
import * as E from '../src/event';
import * as R from '../src/reactive';
import * as B from '../src/batch';

const EMIT_COUNT = 2_048;

const flushMicrotasks = () =>
  new Promise<void>((resolve) => {
    Promise.resolve().then(() => resolve());
  });

const runEmitLoop = async (useBatch: boolean) => {
  const [event, emit] = E.create<number>();
  const total = E.fold(event, 0, (acc, value) => acc + value);

  if (useBatch) {
    B.batch(() => {
      for (let i = 0; i < EMIT_COUNT; i++) emit(1);
    });
  } else {
    for (let i = 0; i < EMIT_COUNT; i++) emit(1);
  }

  await flushMicrotasks();

  const finalValue = R.get(total);
  if (finalValue !== EMIT_COUNT) {
    throw new Error(`Expected ${EMIT_COUNT}, got ${finalValue}`);
  }

  R.cleanup(total);
  E.cleanup(event);
  return finalValue;
};

const countQueuedMicrotasks = async (
  run: () => Promise<void> | void,
): Promise<number> => {
  const originalQueueMicrotask = globalThis.queueMicrotask;
  let queued = 0;

  globalThis.queueMicrotask = ((cb: VoidFunction) => {
    queued += 1;
    return originalQueueMicrotask(cb);
  }) as typeof globalThis.queueMicrotask;

  try {
    await run();
    // Let queued callbacks run before restoring the original function.
    await flushMicrotasks();
  } finally {
    globalThis.queueMicrotask = originalQueueMicrotask;
  }

  return queued;
};

describe('FRP scheduler / batching throughput', () => {
  bench(`emit loop unbatched (N=${EMIT_COUNT})`, async () => {
    return runEmitLoop(false);
  });

  bench(`emit loop batched (N=${EMIT_COUNT})`, async () => {
    return runEmitLoop(true);
  });
});

describe('FRP scheduler / microtask counts', () => {
  bench(`microtasks queued for unbatched emits (N=${EMIT_COUNT})`, async () => {
    const queued = await countQueuedMicrotasks(async () => {
      await runEmitLoop(false);
    });
    if (queued !== 0) {
      throw new Error(`Expected 0 queued microtasks for unbatched path, got ${queued}`);
    }
    return queued;
  });

  bench(`microtasks queued for batched emits (N=${EMIT_COUNT})`, async () => {
    const queued = await countQueuedMicrotasks(async () => {
      await runEmitLoop(true);
    });
    if (queued !== 1) {
      throw new Error(`Expected 1 queued microtask for batched path, got ${queued}`);
    }
    return queued;
  });
});
