import { setDebugHook } from "@synx/frp/debug";
import { isEvent } from "@synx/frp/event";
import { isReactive } from "@synx/frp/reactive";
import { registry } from "./registry";

interface Construct {
  op: string;
  inputs: object[];
}

// Maps each produced node object to how it was constructed. Module-level so it
// accumulates as operators run. Reassigned (not .clear()'d) since it's a WeakMap.
let constructs = new WeakMap<object, Construct>();

/**
 * Install the FRP debug hook so that every wrapped operator records its output
 * node, operation name, and input nodes. Call once before building components.
 */
export function installTopologyHook(): void {
  setDebugHook(({ op, output, args }) => {
    if (output === null || typeof output !== "object") return;
    constructs.set(output, { op, inputs: collectInputs(args) });
  });
}

// Collect FRP-node inputs from an operator's args, descending one level into
// array args (e.g. mergeAll([e1, e2, e3]) passes the events inside an array).
function collectInputs(args: readonly unknown[]): object[] {
  const inputs: object[] = [];
  for (const a of args) {
    if (isEvent(a) || isReactive(a)) {
      inputs.push(a);
    } else if (Array.isArray(a)) {
      for (const el of a) {
        if (isEvent(el) || isReactive(el)) inputs.push(el);
      }
    }
  }
  return inputs;
}

/** Remove the hook and forget all recorded construction info. */
export function clearTopology(): void {
  setDebugHook(null);
  constructs = new WeakMap();
}

/** The operation that produced a labeled node, if known. */
export function operationOf(node: object): string | undefined {
  return constructs.get(node)?.op;
}

/**
 * Derive edges between *labeled* nodes from the recorded construction graph.
 * Walks upstream through unlabeled intermediates to the nearest labeled
 * ancestors, so only the user's named surface appears.
 */
export function resolveEdges(
  named: Iterable<{ name: string; target: object }>,
): Array<{ from: string; to: string }> {
  const list = Array.from(named);
  const nameOf = new Map<object, string>();
  for (const n of list) nameOf.set(n.target, n.name);

  const edges: Array<{ from: string; to: string }> = [];
  const seenEdge = new Set<string>();

  for (const { name, target } of list) {
    const visited = new Set<object>();

    const visit = (node: object): void => {
      const c = constructs.get(node);
      if (!c) return;
      for (const input of c.inputs) {
        const from = nameOf.get(input);
        if (from !== undefined) {
          const key = `${from}->${name}`;
          if (!seenEdge.has(key)) {
            seenEdge.add(key);
            edges.push({ from, to: name });
          }
        } else if (!visited.has(input)) {
          visited.add(input);
          visit(input);
        }
      }
    };

    visit(target);
  }

  return edges;
}

/** Resolve edges between nodes registered in the global registry via label(). */
export function resolveNamedEdges(): Array<{ from: string; to: string }> {
  return resolveEdges(
    registry.getAll().map((d) => ({ name: d.name, target: d.target as object })),
  );
}

export interface GraphNode {
  name: string;
  /** Operator that produced the node, or "source" for injectable roots. */
  operation: string;
  kind: string;
}

export interface GraphTopology {
  nodes: GraphNode[];
  edges: Array<{ from: string; to: string }>;
}

/** Render a graph topology as orientation text. */
export function formatGraph(topology: GraphTopology): string {
  const { nodes, edges } = topology;
  if (nodes.length === 0) return "(no nodes)";

  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    const list = incoming.get(e.to);
    if (list) list.push(e.from);
    else incoming.set(e.to, [e.from]);
  }

  const maxNameLen = Math.max(...nodes.map((n) => n.name.length));
  const lines: string[] = [`Nodes (${nodes.length}):`];
  for (const n of nodes) {
    const nameCol = n.name.padEnd(maxNameLen);
    const ins = incoming.get(n.name);
    const inStr = ins && ins.length > 0 ? `  <- ${ins.join(", ")}` : "";
    lines.push(`  ${nameCol}  [${n.operation}]${inStr}`);
  }
  lines.push("");
  lines.push(
    edges.length > 0
      ? `Edges: ${edges.map((e) => `${e.from}->${e.to}`).join(", ")}`
      : "Edges: (none)",
  );
  return lines.join("\n");
}
