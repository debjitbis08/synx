import { describe, it, expect } from "vitest";
import * as E from "@synx/frp/event";
import * as R from "@synx/frp/reactive";
import { spy, spyEvent, spyReactive } from "./spy";

describe("spyEvent", () => {
  it("records emitted values", () => {
    const [event, emit] = E.create<number>();
    const s = spyEvent(event);

    emit(1);
    emit(2);
    emit(3);

    expect(s.values).toEqual([1, 2, 3]);
    expect(s.lastValue).toBe(3);
    expect(s.count).toBe(3);
    expect(s.called).toBe(true);

    s.dispose();
  });

  it("returns empty before any emission", () => {
    const [event] = E.create<number>();
    const s = spyEvent(event);

    expect(s.values).toEqual([]);
    expect(s.lastValue).toBe(undefined);
    expect(s.count).toBe(0);
    expect(s.called).toBe(false);

    s.dispose();
  });

  it("stops recording after dispose", () => {
    const [event, emit] = E.create<number>();
    const s = spyEvent(event);

    emit(1);
    s.dispose();
    emit(2);

    expect(s.values).toEqual([1]);
  });

  it("clears on reset", () => {
    const [event, emit] = E.create<number>();
    const s = spyEvent(event);

    emit(1);
    emit(2);
    s.reset();

    expect(s.values).toEqual([]);
    expect(s.count).toBe(0);

    emit(3);
    expect(s.values).toEqual([3]);

    s.dispose();
  });
});

describe("spyReactive", () => {
  it("captures initial value and changes", () => {
    const [inc, emitInc] = E.create<void>();
    const count = E.fold(inc, 0, (n) => n + 1);
    const s = spyReactive(count);

    expect(s.value).toBe(0);
    expect(s.history).toEqual([0]);
    expect(s.changeCount).toBe(0);

    emitInc();

    expect(s.value).toBe(1);
    expect(s.history).toEqual([0, 1]);
    expect(s.changeCount).toBe(1);

    s.dispose();
  });

  it("works with R.map (lazy derivation)", () => {
    const [ev, emit] = E.create<number>();
    const base = E.stepper(ev, 0);
    const doubled = R.map(base, (n) => n * 2);
    const s = spyReactive(doubled);

    expect(s.value).toBe(0);
    expect(s.history).toEqual([0]);

    emit(5);

    expect(s.value).toBe(10);
    expect(s.history).toEqual([0, 10]);

    s.dispose();
  });

  it("works with R.of (constant reactive)", () => {
    const r = R.of(42);
    const s = spyReactive(r);

    expect(s.value).toBe(42);
    expect(s.history).toEqual([42]);
    expect(s.changeCount).toBe(0);

    s.dispose();
  });

  it("stops recording after dispose", () => {
    const [inc, emitInc] = E.create<void>();
    const count = E.fold(inc, 0, (n) => n + 1);
    const s = spyReactive(count);

    emitInc();
    s.dispose();
    emitInc();

    expect(s.history).toEqual([0, 1]);
  });

  it("resets history keeping current value", () => {
    const [inc, emitInc] = E.create<void>();
    const count = E.fold(inc, 0, (n) => n + 1);
    const s = spyReactive(count);

    emitInc();
    emitInc();
    expect(s.history).toEqual([0, 1, 2]);

    s.reset();
    expect(s.history).toEqual([2]);
    expect(s.changeCount).toBe(0);

    emitInc();
    expect(s.history).toEqual([2, 3]);

    s.dispose();
  });

  it("tracks multiple rapid changes", () => {
    const [ev, emit] = E.create<number>();
    const sum = E.fold(ev, 0, (acc, n) => acc + n);
    const s = spyReactive(sum);

    emit(10);
    emit(20);
    emit(30);

    expect(s.value).toBe(60);
    expect(s.history).toEqual([0, 10, 30, 60]);

    s.dispose();
  });
});

describe("spy (auto-detect)", () => {
  it("detects Event", () => {
    const [event, emit] = E.create<number>();
    const s = spy(event);

    emit(42);
    expect((s as any).values).toEqual([42]);
    expect((s as any).called).toBe(true);

    s.dispose();
  });

  it("detects Reactive", () => {
    const r = R.of(10);
    const s = spy(r);

    expect((s as any).history).toEqual([10]);
    expect((s as any).value).toBe(10);

    s.dispose();
  });

  it("works with fold result (Reactive)", () => {
    const [ev, emit] = E.create<void>();
    const count = E.fold(ev, 0, (n) => n + 1);
    const s = spy(count);

    emit();
    expect((s as any).value).toBe(1);
    expect((s as any).history).toEqual([0, 1]);

    s.dispose();
  });
});
