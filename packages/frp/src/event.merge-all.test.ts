import { describe, it, expect } from "vitest";
import * as E from "./event";

describe("mergeAll", () => {
  it("merges emissions from multiple events in arrival order", () => {
    const [a, emitA] = E.create<number>();
    const [b, emitB] = E.create<number>();
    const [c, emitC] = E.create<number>();

    const merged = E.mergeAll([a, b, c]);
    const values: number[] = [];
    const unsubscribe = E.subscribe(merged, (value) => values.push(value));

    emitA(1);
    emitC(3);
    emitB(2);

    expect(values).toEqual([1, 3, 2]);

    unsubscribe();
    E.cleanup(merged);
    E.cleanup(a);
    E.cleanup(b);
    E.cleanup(c);
  });

  it("returns a never event for empty input", () => {
    const merged = E.mergeAll<number>([]);
    const values: number[] = [];
    const unsubscribe = E.subscribe(merged, (value) => values.push(value));

    expect(values).toEqual([]);

    unsubscribe();
    E.cleanup(merged);
  });

  it("returns the same event instance when only one event is provided", () => {
    const [source] = E.create<number>();
    const merged = E.mergeAll([source]);

    expect(merged).toBe(source);

    E.cleanup(source);
  });
});
