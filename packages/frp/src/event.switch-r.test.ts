import { describe, it, expect } from "vitest";
import * as E from "./event";

describe("switchR", () => {
  it("switches to the latest event from a reactive event source", () => {
    const [a, emitA] = E.create<number>();
    const [b, emitB] = E.create<number>();

    const [sourceChanged, emitSourceChanged] = E.create<E.Event<number>>();
    const source = E.stepper(sourceChanged, a);

    const switched = E.switchR(source);
    const values: number[] = [];
    const unsubscribe = E.subscribe(switched, (value) => values.push(value));

    emitA(1);
    emitSourceChanged(b);
    emitA(2);
    emitB(3);

    expect(values).toEqual([1, 3]);

    unsubscribe();
    E.cleanup(switched);
    E.cleanup(sourceChanged);
    E.cleanup(a);
    E.cleanup(b);
  });
});
