import { describe, it, expect } from "vitest";
import * as E from "@synx/frp/event";
import { createCounter } from "../../../examples/frp/counter";
import { createSession } from "./session";
import "@synx/debug/vitest";

describe("vitest matchers", () => {
  function counterSession() {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label } = createCounter(inc, dec);
    const s = createSession();
    s.source("increment", inc, emitInc);
    s.source("decrement", dec, emitDec);
    s.track("changes", changes);
    s.track("count", count);
    s.track("label", label);
    return s;
  }

  it("toHaveEmitted / toHaveLastEmitted", () => {
    const s = counterSession();
    s.inject("increment", undefined);

    expect(s).toHaveEmitted("changes", 1);
    expect(s).toHaveEmitted("count", 1);
    expect(s).toHaveLastEmitted("label", "Count: 1");
    expect(s).not.toHaveEmitted("count", 99);

    s.dispose();
  });

  it("toHaveHistory", () => {
    const s = counterSession();
    s.inject("increment", undefined);
    s.inject("increment", undefined);
    s.inject("decrement", undefined);

    expect(s).toHaveHistory("count", [1, 2, 1]);
    expect(s).toHaveHistory("label", ["Count: 1", "Count: 2", "Count: 1"]);
    expect(s).not.toHaveHistory("count", [1, 2, 3]);

    s.dispose();
  });

  it("toNotHaveEmitted", () => {
    const s = counterSession();
    s.inject("increment", undefined);

    expect(s).toNotHaveEmitted("decrement");
    expect(s).not.toNotHaveEmitted("count");

    s.dispose();
  });

  it("produces a readable failure message", () => {
    const s = counterSession();
    s.inject("increment", undefined);

    expect(() => expect(s).toHaveLastEmitted("count", 5)).toThrowError(
      /"count" last emission to equal/,
    );

    s.dispose();
  });
});
