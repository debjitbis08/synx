import { describe, expect, it } from "vitest";
import * as E from "./event";
import * as R from "./reactive";

describe("effect", () => {
  it("is post-flush, coalesces sync updates, and observes latest value", async () => {
    const [ev, emit] = E.create<number>();
    const r = E.stepper(ev, 0);
    const seen: number[] = [];

    const unsub = R.effect(r, (v) => {
      seen.push(v);
    });

    emit(1);
    emit(2);
    emit(3);

    expect(seen).toEqual([]);

    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([3]);
    unsub();
  });
});

describe("subscribe", () => {
  it("remains immediate and emits current value on subscribe", () => {
    const [ev, emit] = E.create<number>();
    const r = E.stepper(ev, 0);
    const seen: number[] = [];

    const unsub = R.subscribe(r, (v) => {
      seen.push(v);
    });

    emit(1);
    emit(2);

    expect(seen).toEqual([0, 1, 2]);
    unsub();
  });
});

describe("effectPostFlush", () => {
  it("coalesces sync updates and observes latest value after flush", async () => {
    const [ev, emit] = E.create<number>();
    const r = E.stepper(ev, 0);
    const seen: number[] = [];

    const unsub = R.effectPostFlush(r, (v) => {
      seen.push(v);
    });

    emit(1);
    emit(2);
    emit(3);

    expect(seen).toEqual([]);

    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([3]);
    unsub();
  });

  it("does not run queued callback after unsubscribe", async () => {
    const [ev, emit] = E.create<number>();
    const r = E.stepper(ev, 0);
    const seen: number[] = [];

    const unsub = R.effectPostFlush(r, (v) => {
      seen.push(v);
    });

    emit(1);
    unsub();

    await Promise.resolve();
    await Promise.resolve();

    expect(seen).toEqual([]);
  });
});
