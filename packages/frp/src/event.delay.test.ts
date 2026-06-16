import { describe, it, expect } from 'vitest';
import * as E from './event';

const wait = (ms = 0) => new Promise<void>((r) => setTimeout(r, ms));

describe('delay', () => {
  it('re-emits each occurrence after ms, preserving order', async () => {
    const [ev, fire] = E.create<number>();
    const seen: number[] = [];
    E.subscribe(E.delay(ev, 10), (n) => seen.push(n));

    fire(1);
    fire(2);
    expect(seen).toEqual([]); // nothing yet

    await wait(40);
    expect(seen).toEqual([1, 2]);
  });

  it('clears pending timers when the subscription is torn down', async () => {
    const [ev, fire] = E.create<number>();
    const seen: number[] = [];
    const unsub = E.subscribe(E.delay(ev, 10), (n) => seen.push(n));

    fire(1);
    unsub(); // tear down before the timer fires

    await wait(40);
    expect(seen).toEqual([]);
  });
});
