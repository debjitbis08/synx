import { bench, describe } from 'vitest';
import * as R from '../src/reactive';
import * as E from '../src/event';
import type { Reactive } from '../src/reactive';
import type { Event } from '../src/event';

const MAP_CHAIN_LENGTH = 256;
const EVENT_CHAIN_LENGTH = 256;
const EVENT_FANOUT = 512;
const HANDLER_CHAINS = [4, 16, 64, Math.pow(2, 10), Math.pow(2, 15)];

const flushMicrotasks = () =>
  new Promise<void>((resolve) => {
    Promise.resolve().then(() => resolve());
  });

const buildHandlerChain = (length: number) => {
  const handlers: Array<(value: number) => number> = [];

  for (let i = 0; i < length; i++) {
    handlers.push((value) => value + i);
  }

  return handlers;
};

describe('FRP performance', () => {
  bench('reactive map chain update', async () => {
    const [updates, emit] = E.create<number>();
    const root = E.stepper(updates, 0) as Reactive<number>;
    const nodes: Reactive<number>[] = [root];

    let current: Reactive<number> = root;
    for (let i = 0; i < MAP_CHAIN_LENGTH; i++) {
      current = R.map(current, (value) => value + 1);
      nodes.push(current);
    }

    emit(1);
    await flushMicrotasks();

    const finalValue = R.get(current);

    for (const node of nodes) {
      R.cleanup(node);
    }
    E.cleanup(updates);

    return finalValue;
  });

  bench('event map chain emit', async () => {
    const [source, emit] = E.create<number>();
    const events: Event<number>[] = [source];

    let current: Event<number> = source;
    for (let i = 0; i < EVENT_CHAIN_LENGTH; i++) {
      current = E.map(current, (value) => value + 1);
      events.push(current);
    }

    const sink = E.fold(current, 0, (_, value) => value);

    emit(1);
    await flushMicrotasks();

    const finalValue = R.get(sink);
    R.cleanup(sink);
    for (const ev of events) {
      E.cleanup(ev);
    }

    return finalValue;
  });

  bench('event broadcast to many subscribers', async () => {
    const [event, emit] = E.create<number>();
    const unsubscribers: Array<() => void> = [];

    for (let i = 0; i < EVENT_FANOUT; i++) {
      unsubscribers.push(
        E.subscribe(event, () => {
          // noop- work happens in subscription bookkeeping
        }),
      );
    }

    emit(42);
    await flushMicrotasks();

    unsubscribers.forEach((fn) => fn());
    E.cleanup(event);
  });

  HANDLER_CHAINS.forEach((length) => {
    bench(`event handler chain length=${length}`, async () => {
      const handlers = buildHandlerChain(length);
      const expected = handlers.reduce((acc, handler) => handler(acc), 1);
      const [event, emit] = E.create<number>();

      const reactive = E.fold(event, 0, (acc, value) => {
        let current = value;
        for (let i = 0; i < handlers.length; i++) {
          current = handlers[i](current);
        }
        return current;
      });

      emit(1);
      await flushMicrotasks();

      const finalValue = R.get(reactive);
      if (finalValue !== expected) {
        throw new Error(
          `Reactive handler chain produced ${finalValue}, expected ${expected}`,
        );
      }
      R.cleanup(reactive);
      E.cleanup(event);
      return finalValue;
    });

    bench(`event handler chain (plain) length=${length}`, () => {
      const handlers = buildHandlerChain(length);
      const expected = handlers.reduce((acc, handler) => handler(acc), 1);

      let current = 1;
      for (let i = 0; i < handlers.length; i++) {
        current = handlers[i](current);
      }

      if (current !== expected) {
        throw new Error(
          `Plain handler chain produced ${current}, expected ${expected}`,
        );
      }

      return current;
    });
  });
});
