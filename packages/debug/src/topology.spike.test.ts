import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as E from "@synx/frp/event";
import { createCounter } from "../../../examples/frp/counter";
import { registry } from "./registry";
import { label, labelSource } from "./label";
import {
  installTopologyHook,
  clearTopology,
  resolveNamedEdges,
  operationOf,
} from "./topology";

// Spike: prove that wrapping operators at the public export boundary lets the
// debug package recover the named graph topology AUTOMATICALLY — the user only
// labels nodes; nobody declares edges.
describe("topology spike: automatic edge capture", () => {
  beforeEach(() => {
    registry.clear();
    installTopologyHook();
  });

  afterEach(() => {
    clearTopology();
    registry.clear();
  });

  it("derives count <- changes <- increment/decrement <- ... and label <- count", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();

    // Build the component AFTER the hook is installed so construction is recorded.
    const { changes, count, label: countLabel } = createCounter(inc, dec);

    // The user labels only the nodes they care about. No edges declared.
    labelSource("increment", inc, emitInc);
    labelSource("decrement", dec, emitDec);
    label("changes", changes);
    label("count", count);
    label("label", countLabel);

    const edges = resolveNamedEdges();

    // Edges recovered structurally, walking through the unlabeled intermediate
    // map() nodes that concat() consumes.
    expect(edges).toContainEqual({ from: "increment", to: "changes" });
    expect(edges).toContainEqual({ from: "decrement", to: "changes" });
    expect(edges).toContainEqual({ from: "changes", to: "count" });
    expect(edges).toContainEqual({ from: "count", to: "label" });
  });

  it("captures edges through filter and array-input mergeAll", () => {
    const [a, emitA] = E.create<number>();
    const [b, emitB] = E.create<number>();
    const [c, emitC] = E.create<number>();

    // merged <- [a, b, c] via array arg; positives <- merged via filter
    const merged = E.mergeAll([a, b, c]);
    const positives = E.filter(merged, (n) => n > 0);

    labelSource("a", a, emitA);
    labelSource("b", b, emitB);
    labelSource("c", c, emitC);
    label("merged", merged);
    label("positives", positives);

    const edges = resolveNamedEdges();

    expect(edges).toContainEqual({ from: "a", to: "merged" });
    expect(edges).toContainEqual({ from: "b", to: "merged" });
    expect(edges).toContainEqual({ from: "c", to: "merged" });
    expect(edges).toContainEqual({ from: "merged", to: "positives" });
    expect(operationOf(merged as object)).toBe("mergeAll");
    expect(operationOf(positives as object)).toBe("filter");
  });

  it("captures the operation name for each labeled node", () => {
    const [inc, emitInc] = E.create<void>();
    const [dec, emitDec] = E.create<void>();
    const { changes, count, label: countLabel } = createCounter(inc, dec);

    label("changes", changes);
    label("count", count);
    label("label", countLabel);

    expect(operationOf(changes as object)).toBe("concat");
    expect(operationOf(count as object)).toBe("fold");
    expect(operationOf(countLabel as object)).toBe("map");
  });
});
