import { describe, it, expect, beforeEach } from "vitest";
import { SynxMcpCore } from "../src/core";
import { dispatch } from "../src/tools";
import { build } from "../../../examples/frp/counter.debug";

// Load via the importer thunk (runs build(), which labels nodes) against the
// real example. Same orchestration loadFile() uses, without file resolution.
async function loadedCore(): Promise<SynxMcpCore> {
  const core = new SynxMcpCore();
  await core.load(() => Promise.resolve(build()));
  return core;
}

describe("SynxMcpCore", () => {
  let core: SynxMcpCore;
  beforeEach(async () => {
    core = await loadedCore();
  });

  it("load() returns the graph topology", () => {
    const g = core.graph();
    expect(g.nodes.map((n) => n.name).sort()).toEqual([
      "changes",
      "count",
      "decrement",
      "increment",
      "label",
    ]);
    expect(g.edges).toContainEqual({ from: "changes", to: "count" });
    expect(g.edges).toContainEqual({ from: "count", to: "label" });
  });

  it("graphText() includes op tags", () => {
    const text = core.graphText();
    expect(text).toContain("[fold]");
    expect(text).toContain("count");
  });

  it("inject() returns the propagation trace", () => {
    const { trace, entries } = core.inject("increment", null);
    expect(trace).toContain("count");
    expect(trace).toContain("[fold]");
    expect(entries.some((e) => e.nodeName === "count" && e.nextValue === 1)).toBe(true);
  });

  it("assert() passes and fails with history", () => {
    core.inject("increment", null);
    core.inject("increment", null);

    const ok = core.assert("count", 2);
    expect(ok.pass).toBe(true);

    const bad = core.assert("count", 99);
    expect(bad.pass).toBe(false);
    expect(bad.message).toContain("FAIL  count");
    expect(bad.message).toContain("History:  [1, 2]");
  });

  it("history() returns emitted values", () => {
    core.inject("increment", null);
    core.inject("decrement", null);
    expect(core.history("count")).toEqual({ history: [1, 0], count: 2 });
  });

  it("resetTrace() clears trace but keeps the component", () => {
    core.inject("increment", null);
    core.resetTrace();
    expect(core.history("count")).toEqual({ history: [], count: 0 });
    // Still loaded: a new inject works and continues from current state.
    core.inject("increment", null);
    expect(core.assert("count", 2).pass).toBe(true);
  });

  it("throws a helpful error before loading", () => {
    const fresh = new SynxMcpCore();
    expect(() => fresh.graphText()).toThrowError(/No component loaded/);
  });
});

describe("dispatch", () => {
  let core: SynxMcpCore;
  beforeEach(async () => {
    core = await loadedCore();
  });

  it("routes synx_graph / synx_inject / synx_assert / synx_history / synx_trace / synx_reset", async () => {
    expect(await dispatch(core, "synx_graph", {})).toContain("Edges:");

    const injected = await dispatch(core, "synx_inject", { node: "increment", value: null });
    expect(injected).toContain("count");

    expect(await dispatch(core, "synx_assert", { node: "count", expected: 1 })).toContain("PASS");
    expect(await dispatch(core, "synx_assert", { node: "count", expected: 7 })).toContain("FAIL");

    expect(await dispatch(core, "synx_history", { node: "count" })).toBe(
      JSON.stringify({ history: [1], count: 1 }),
    );

    expect(await dispatch(core, "synx_trace", {})).toContain("inject:");
    expect(await dispatch(core, "synx_reset", {})).toBe("Session reset");
  });

  it("rejects unknown tools", async () => {
    await expect(dispatch(core, "synx_nope", {})).rejects.toThrow(/Unknown tool/);
  });
});
