import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as E from "@synx/frp/event";
import { createCounter } from "../../../examples/frp/counter";
import { registry } from "./registry";
import { createSession } from "./session";
import { installTopologyHook, clearTopology } from "./topology";

describe("session.graph() / graphText()", () => {
  beforeEach(() => {
    registry.clear();
    installTopologyHook();
  });

  afterEach(() => {
    clearTopology();
    registry.clear();
  });

  it("returns nodes (with op + kind) and derived edges", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.source("decrement", dec, emitDec);
    s.track("changes", changes);
    s.track("count", count);
    s.track("label", label);

    const g = s.graph();

    expect(g.nodes).toContainEqual({
      name: "increment",
      operation: "source",
      kind: "source",
    });
    expect(g.nodes).toContainEqual({
      name: "count",
      operation: "fold",
      kind: "derived",
    });
    expect(g.nodes).toContainEqual({
      name: "label",
      operation: "map",
      kind: "derived",
    });

    expect(g.edges).toContainEqual({ from: "increment", to: "changes" });
    expect(g.edges).toContainEqual({ from: "changes", to: "count" });
    expect(g.edges).toContainEqual({ from: "count", to: "label" });

    s.dispose();
  });

  it("renders graphText with op tags and incoming edges", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.track("changes", changes);
    s.track("count", count);
    s.track("label", label);

    const text = s.graphText();

    expect(text).toContain("Nodes (4):");
    expect(text).toMatch(/count\s+\[fold\]\s+<- changes/);
    expect(text).toMatch(/label\s+\[map\]\s+<- count/);
    expect(text).toContain("changes->count");

    s.dispose();
  });

  it("degrades to [derived]/[source] tags when topology is absent", () => {
    clearTopology();
    const [inc, emitInc] = E.create<void>();
    const [dec] = E.create<void>();
    const { count } = createCounter(inc, dec);

    const s = createSession();
    s.source("increment", inc, emitInc);
    s.track("count", count);

    const g = s.graph();
    expect(g.nodes).toContainEqual({
      name: "count",
      operation: "derived",
      kind: "derived",
    });
    expect(g.edges).toEqual([]);

    s.dispose();
  });
});
