import { describe, it, expect } from "vitest";
import * as E from "@synx/frp/event";
import { spy, createSession } from "./index";
import { createCounter } from "../../../examples/frp/counter";

// ── Approach 1: Spy (direct, simplest) ──────────────────────────────
describe("counter with spy", () => {
  it("increments", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { count, label } = createCounter(inc, dec);

    const countSpy = spy(count);
    const labelSpy = spy(label);

    emitInc();

    expect(countSpy.value).toBe(1);
    expect(labelSpy.value).toBe("Count: 1");
    expect(countSpy.history).toEqual([0, 1]);

    countSpy.dispose();
    labelSpy.dispose();
  });

  it("decrements", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { count } = createCounter(inc, dec);

    const countSpy = spy(count);

    emitInc();
    emitInc();
    emitDec();

    expect(countSpy.value).toBe(1);
    expect(countSpy.history).toEqual([0, 1, 2, 1]);

    countSpy.dispose();
  });

  it("handles rapid changes", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { count } = createCounter(inc, dec);

    const countSpy = spy(count);

    for (let i = 0; i < 5; i++) emitInc();

    expect(countSpy.value).toBe(5);
    expect(countSpy.history).toEqual([0, 1, 2, 3, 4, 5]);
    expect(countSpy.changeCount).toBe(5);

    countSpy.dispose();
  });

  it("tracks the changes event stream", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes } = createCounter(inc, dec);

    const changesSpy = spy(changes);

    emitInc();
    emitDec();
    emitInc();

    expect(changesSpy.values).toEqual([1, -1, 1]);
    expect(changesSpy.count).toBe(3);

    changesSpy.dispose();
  });
});

// ── Approach 2: Session (named nodes, injection, tracing) ───────────
describe("counter with session", () => {
  it("inject and assert", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.source("decrement", dec, emitDec);
    s.track("changes", changes);
    s.track("count", count);
    s.track("label", label);

    s.inject("increment", undefined);

    s.expect("changes").toHaveEmitted(1);
    s.expect("count").toHaveLastEmitted(1);
    s.expect("label").toHaveLastEmitted("Count: 1");

    s.dispose();
  });

  it("full sequence with trace", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.source("decrement", dec, emitDec);
    s.track("changes", changes);
    s.track("count", count);
    s.track("label", label);

    s.inject("increment", undefined);
    s.inject("increment", undefined);
    s.inject("decrement", undefined);

    s.expect("count").toHaveHistory([1, 2, 1]);
    s.expect("label").toHaveHistory(["Count: 1", "Count: 2", "Count: 1"]);

    console.log(s.traceText());

    s.dispose();
  });

  it("reset clears trace between test phases", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { count } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.track("count", count);

    // Phase 1
    s.inject("increment", undefined);
    s.inject("increment", undefined);
    s.expect("count").toHaveLastEmitted(2);

    s.reset();

    // Phase 2: count is now at 2, trace is fresh
    s.inject("increment", undefined);
    s.expect("count").toHaveHistory([3]);

    s.dispose();
  });
});
