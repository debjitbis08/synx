/**
 * FRP Graph Visualization System
 *
 * Captures both compile-time metadata (variable names, source locations)
 * and runtime structure (subscriptions, dependencies).
 */

import type { Event } from "./event";
import type { Reactive } from "./reactive";

// ============================================================================
// Types
// ============================================================================

export type NodeType = "event" | "reactive" | "future";

export type OperationType =
  | "create"
  | "map"
  | "filter"
  | "mergeAll"
  | "mergeWith"
  | "fold"
  | "stepper"
  | "zip"
  | "chain"
  | "ap"
  | "switchE"
  | "switchR"
  | "snapshot"
  | "sample"
  | "tag"
  | "debounce"
  | "throttle"
  | "when"
  | "whenR"
  | "bind"
  | "effect";

export interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

export interface NodeMetadata {
  /** Variable name from source code (compile-time) */
  name?: string;
  /** Source location where node was created */
  location?: SourceLocation;
  /** Operation that created this node */
  operation: OperationType;
  /** Human-readable label */
  label?: string;
  /** Additional debug info */
  debugInfo?: Record<string, any>;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  metadata: NodeMetadata;
  /** IDs of nodes this depends on */
  inputs: string[];
  /** IDs of nodes that depend on this */
  outputs: string[];
  /** Current value (for debugging) */
  currentValue?: any;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** Type of dependency */
  edgeType: "subscription" | "map-derivation" | "change-event";
  /** Additional metadata */
  metadata?: Record<string, any>;
}

export interface FRPGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export interface SerializedGraph {
  nodes: Array<GraphNode>;
  edges: Array<GraphEdge>;
}

// ============================================================================
// Runtime Graph Tracker
// ============================================================================

class GraphTracker {
  private static instance: GraphTracker | null = null;
  private enabled = false;
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private nodeCounter = 0;

  static getInstance(): GraphTracker {
    if (!GraphTracker.instance) {
      GraphTracker.instance = new GraphTracker();
    }
    return GraphTracker.instance;
  }

  private constructor() {
    // Check if graph tracking is enabled
    if (typeof process !== "undefined" && process.env) {
      this.enabled = process.env.SYNX_GRAPH === "1" || process.env.SYNX_GRAPH === "true";
    }
    const globalScope = globalThis as any;
    if (globalScope.__SYNX_GRAPH__ === true) {
      this.enabled = true;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  reset(): void {
    this.nodes.clear();
    this.edges = [];
    this.nodeCounter = 0;
  }

  private generateId(): string {
    return `node_${++this.nodeCounter}`;
  }

  /**
   * Track a new Event or Reactive node
   */
  trackNode<T extends Event<any> | Reactive<any>>(
    obj: T,
    type: NodeType,
    metadata: NodeMetadata,
    inputs: string[] = [],
  ): string {
    if (!this.enabled) {
      return "";
    }

    const id = this.generateId();

    // Store ID on the object for future reference
    (obj as any).__graphNodeId__ = id;

    const node: GraphNode = {
      id,
      type,
      metadata,
      inputs,
      outputs: [],
    };

    this.nodes.set(id, node);

    // Create edges from inputs
    for (const inputId of inputs) {
      this.addEdge(inputId, id, "subscription");

      // Update input node's outputs
      const inputNode = this.nodes.get(inputId);
      if (inputNode && !inputNode.outputs.includes(id)) {
        inputNode.outputs.push(id);
      }
    }

    return id;
  }

  /**
   * Get the graph node ID for an Event/Reactive
   */
  getNodeId(obj: Event<any> | Reactive<any>): string | undefined {
    return (obj as any).__graphNodeId__;
  }

  /**
   * Add an edge between two nodes
   */
  addEdge(
    fromId: string,
    toId: string,
    edgeType: GraphEdge["edgeType"],
    metadata?: Record<string, any>,
  ): void {
    if (!this.enabled) {
      return;
    }

    // Check if edge already exists
    const exists = this.edges.some(
      (e) => e.from === fromId && e.to === toId && e.edgeType === edgeType,
    );

    if (!exists) {
      this.edges.push({ from: fromId, to: toId, edgeType, metadata });
    }
  }

  /**
   * Update node metadata (e.g., when value changes)
   */
  updateNode(id: string, updates: Partial<GraphNode>): void {
    if (!this.enabled) {
      return;
    }

    const node = this.nodes.get(id);
    if (node) {
      Object.assign(node, updates);
    }
  }

  /**
   * Get the current graph
   */
  getGraph(): FRPGraph {
    return {
      nodes: new Map(this.nodes),
      edges: [...this.edges],
    };
  }

  /**
   * Get serialized graph (for export)
   */
  getSerializedGraph(): SerializedGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: [...this.edges],
    };
  }

  /**
   * Export graph as DOT format (Graphviz)
   */
  toDot(): string {
    const lines: string[] = ["digraph FRP {"];
    lines.push("  rankdir=LR;");
    lines.push("  node [shape=box, style=rounded];");
    lines.push("");

    // Nodes
    for (const [id, node] of this.nodes) {
      const name = node.metadata.name || node.metadata.operation;
      const label = `${name}\\n(${node.type})`;
      const color = node.type === "event" ? "lightblue" : "lightgreen";
      lines.push(`  ${id} [label="${label}", fillcolor="${color}", style="rounded,filled"];`);
    }

    lines.push("");

    // Edges
    for (const edge of this.edges) {
      const style = edge.edgeType === "subscription" ? "solid" : "dashed";
      lines.push(`  ${edge.from} -> ${edge.to} [style=${style}];`);
    }

    lines.push("}");
    return lines.join("\n");
  }

  /**
   * Export graph as Mermaid format
   */
  toMermaid(): string {
    const lines: string[] = ["graph LR"];

    // Nodes
    for (const [id, node] of this.nodes) {
      const name = node.metadata.name || node.metadata.operation;
      const shape = node.type === "event" ? "[" : "(";
      const shapeEnd = node.type === "event" ? "]" : ")";
      lines.push(`  ${id}${shape}${name}<br/>${node.type}${shapeEnd}`);
    }

    // Edges
    for (const edge of this.edges) {
      const arrow = edge.edgeType === "subscription" ? "-->" : "-.->";
      lines.push(`  ${edge.from} ${arrow} ${edge.to}`);
    }

    return lines.join("\n");
  }

  /**
   * Export graph as JSON for D3.js or other visualization libraries
   */
  toD3(): { nodes: any[]; links: any[] } {
    const nodes = Array.from(this.nodes.values()).map((node) => ({
      id: node.id,
      name: node.metadata.name || node.metadata.operation,
      type: node.type,
      operation: node.metadata.operation,
      group: node.type === "event" ? 1 : 2,
      ...node.metadata,
    }));

    const links = this.edges.map((edge) => ({
      source: edge.from,
      target: edge.to,
      type: edge.edgeType,
      ...edge.metadata,
    }));

    return { nodes, links };
  }
}

// ============================================================================
// Public API
// ============================================================================

export const graphTracker = GraphTracker.getInstance();

/**
 * Enable graph tracking globally
 */
export function enableGraphTracking(): void {
  graphTracker.enable();
}

/**
 * Disable graph tracking globally
 */
export function disableGraphTracking(): void {
  graphTracker.disable();
}

/**
 * Check if graph tracking is enabled
 */
export function isGraphTrackingEnabled(): boolean {
  return graphTracker.isEnabled();
}

/**
 * Reset the graph (clear all nodes and edges)
 */
export function resetGraph(): void {
  graphTracker.reset();
}

/**
 * Get the current FRP graph
 */
export function getGraph(): FRPGraph {
  return graphTracker.getGraph();
}

/**
 * Get serialized graph for export
 */
export function getSerializedGraph(): SerializedGraph {
  return graphTracker.getSerializedGraph();
}

/**
 * Export graph in various formats
 */
export function exportGraph(format: "dot" | "mermaid" | "d3" | "json"): string | object {
  switch (format) {
    case "dot":
      return graphTracker.toDot();
    case "mermaid":
      return graphTracker.toMermaid();
    case "d3":
      return graphTracker.toD3();
    case "json":
      return graphTracker.getSerializedGraph();
    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * Render graph to console (for debugging)
 */
export function printGraph(): void {
  const graph = graphTracker.getGraph();
  console.log("=== FRP Graph ===");
  console.log(`Nodes: ${graph.nodes.size}`);
  console.log(`Edges: ${graph.edges.length}`);
  console.log("\nNodes:");
  for (const [id, node] of graph.nodes) {
    const name = node.metadata.name || node.metadata.operation;
    console.log(`  ${id}: ${name} (${node.type}) [${node.metadata.operation}]`);
    if (node.inputs.length > 0) {
      console.log(`    inputs: ${node.inputs.join(", ")}`);
    }
    if (node.outputs.length > 0) {
      console.log(`    outputs: ${node.outputs.join(", ")}`);
    }
  }
  console.log("\nEdges:");
  for (const edge of graph.edges) {
    console.log(`  ${edge.from} -> ${edge.to} (${edge.edgeType})`);
  }
}

// Export for internal use by Event/Reactive implementations
export { GraphTracker };
