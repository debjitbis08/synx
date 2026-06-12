import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as E from "@synx/frp/event";
import { createCounter } from "../../../examples/frp/counter";
import { registry } from "./registry";
import { createSession } from "./session";
import { installTopologyHook, clearTopology } from "./topology";

// Trace output should indent by propagation depth and tag each node with the
// operator that produced it, when the topology hook is installed.
describe("trace depth + op tags", () => {
  beforeEach(() => {
    registry.clear();
    installTopologyHook();
  });

  afterEach(() => {
    clearTopology();
    registry.clear();
  });

  it("renders nested depth and [op] tags", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.track("changes", changes);
    s.track("count", count);
    s.track("label", label);

    s.inject("increment", undefined);

    const text = s.traceText();

    // Deeper nodes are indented further than shallower ones.
    const indentOf = (name: string) => {
      const line = text.split("\n").find((l) => l.includes(name)) ?? "";
      return line.length - line.trimStart().length;
    };
    expect(indentOf("increment")).toBeLessThan(indentOf("changes"));
    expect(indentOf("changes")).toBeLessThan(indentOf("count"));
    expect(indentOf("count")).toBeLessThan(indentOf("label"));

    // Operator tags appear on derived nodes.
    expect(text).toContain("[concat]");
    expect(text).toContain("[fold]");
    expect(text).toContain("[map]");

    // Sanity: structured entries carry depth + operation.
    const countEntry = s.trace().find((e) => e.nodeName === "count");
    expect(countEntry?.depth).toBe(2);
    expect(countEntry?.operation).toBe("fold");

    s.dispose();
  });

  it("falls back to flat output with no operator tags when topology is absent", () => {
    // No hook installed for this graph (clear it first).
    clearTopology();
    const [inc, emitInc] = E.create<void>();
    const [dec] = E.create<void>();
    const { count } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.track("count", count);
    s.inject("increment", undefined);

    const text = s.traceText();
    expect(text).not.toContain("[");
    const countEntry = s.trace().find((e) => e.nodeName === "count");
    expect(countEntry?.operation).toBeUndefined();

    s.dispose();
  });
});
