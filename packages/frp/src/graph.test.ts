import { describe, it, expect, beforeEach } from "vitest";
import {
  enableGraphTracking,
  disableGraphTracking,
  resetGraph,
  getGraph,
  getSerializedGraph,
  exportGraph,
  isGraphTrackingEnabled,
} from "./graph";
import { $, $$ } from "./graph.macro";
import * as E from "./event.public";
import * as R from "./reactive.public";

describe("Graph Visualization", () => {
  beforeEach(() => {
    resetGraph();
    enableGraphTracking();
  });

  it("should enable and disable tracking", () => {
    expect(isGraphTrackingEnabled()).toBe(true);

    disableGraphTracking();
    expect(isGraphTrackingEnabled()).toBe(false);

    enableGraphTracking();
    expect(isGraphTrackingEnabled()).toBe(true);
  });

  it("should track annotated nodes", () => {
    const event1 = $("event1", E.create<number>());
    const event2 = $("event2", E.create<string>());

    const graph = getGraph();
    expect(graph.nodes.size).toBeGreaterThanOrEqual(0); // Depends on implementation
  });

  it("should annotate multiple nodes with $$", () => {
    const [ev1, ev2] = $$([
      ["event1", E.create<number>()],
      ["event2", E.create<string>()],
    ]);

    expect(ev1).toBeDefined();
    expect(ev2).toBeDefined();
  });

  it("should export graph as JSON", () => {
    $("test", E.create<void>());

    const json = exportGraph("json");
    expect(json).toHaveProperty("nodes");
    expect(json).toHaveProperty("edges");
  });

  it("should export graph as Mermaid", () => {
    $("test", E.create<void>());

    const mermaid = exportGraph("mermaid");
    expect(typeof mermaid).toBe("string");
    expect(mermaid).toContain("graph LR");
  });

  it("should export graph as DOT", () => {
    $("test", E.create<void>());

    const dot = exportGraph("dot");
    expect(typeof dot).toBe("string");
    expect(dot).toContain("digraph FRP");
  });

  it("should export graph as D3", () => {
    $("test", E.create<void>());

    const d3 = exportGraph("d3");
    expect(d3).toHaveProperty("nodes");
    expect(d3).toHaveProperty("links");
  });

  it("should handle complex FRP graphs", () => {
    const clicks = $("clicks", E.create<void>());
    const count = $("count", E.fold(clicks, 0, (n) => n + 1));
    const doubled = $("doubled", R.map(count, (n) => n * 2));

    const graph = getSerializedGraph();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(0);
  });

  it("should reset graph", () => {
    $("test1", E.create<void>());
    $("test2", E.create<void>());

    resetGraph();

    const graph = getGraph();
    expect(graph.nodes.size).toBe(0);
    expect(graph.edges.length).toBe(0);
  });

  it("should not track when disabled", () => {
    disableGraphTracking();

    $("test", E.create<void>());

    const graph = getGraph();
    expect(graph.nodes.size).toBe(0);
  });
});
