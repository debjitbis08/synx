import type { Event } from "@synx/frp/event";
import type { Reactive } from "@synx/frp/reactive";
import { isReactive, get } from "@synx/frp/reactive";
import { subscribe as subscribeEvent } from "@synx/frp/event";
import { registry } from "./registry";
import type { TraceEntry } from "./trace";
import { formatTrace } from "./trace";
import { createNodeAssertion, type NodeAssertion } from "./assertions";
import { operationOf, resolveEdges } from "./topology";

interface TrackedNode {
  name: string;
  kind: "source" | "derived";
  target: Event<any> | Reactive<any>;
  emit?: (value: unknown) => void;
  /** Operator that produced this node, if the topology hook recorded it. */
  operation?: string;
}

export interface SessionOptions {
  /** If true, auto-load all nodes from the global registry */
  useRegistry?: boolean;
}

export interface TraceSession {
  /** Register a source event that can be injected into */
  source<A>(name: string, event: Event<A>, emit: (value: A) => void): void;
  /** Register an event or reactive to observe */
  track<A>(name: string, target: Event<A> | Reactive<A>): void;
  /** Inject a value into a named source event */
  inject(nodeName: string, value: unknown): void;
  /** Assert on a named node's emissions */
  expect(nodeName: string): NodeAssertion;
  /** Get all trace entries since last reset */
  trace(): TraceEntry[];
  /** Get trace as formatted text */
  traceText(): string;
  /** Clear trace entries, keep subscriptions */
  reset(): void;
  /** Unsubscribe everything */
  dispose(): void;
}

export function createSession(opts?: SessionOptions): TraceSession {
  const nodes = new Map<string, TrackedNode>();
  const entries: TraceEntry[] = [];
  const disposers: Array<() => void> = [];
  let currentRound = 0;
  // Propagation depth of each tracked node from the current round's injected
  // source. Recomputed on each inject() from the topology graph.
  let depthByName = new Map<string, number>();

  // BFS over the labeled-edge graph (topology), restricted to tracked nodes,
  // to find each node's distance from the injected source.
  function computeDepths(sourceName: string): Map<string, number> {
    const named = Array.from(nodes.values()).map((n) => ({
      name: n.name,
      target: n.target as object,
    }));
    const adj = new Map<string, string[]>();
    for (const e of resolveEdges(named)) {
      const list = adj.get(e.from);
      if (list) list.push(e.to);
      else adj.set(e.from, [e.to]);
    }

    const depth = new Map<string, number>([[sourceName, 0]]);
    const queue = [sourceName];
    while (queue.length > 0) {
      const node = queue.shift() as string;
      const d = depth.get(node) as number;
      for (const next of adj.get(node) ?? []) {
        if (!depth.has(next)) {
          depth.set(next, d + 1);
          queue.push(next);
        }
      }
    }
    return depth;
  }

  function attachNode(node: TrackedNode): void {
    if (nodes.has(node.name)) return;
    if (node.operation === undefined) {
      node.operation = operationOf(node.target as object);
    }
    nodes.set(node.name, node);

    const target = node.target;

    if (isReactive(target)) {
      const reactive = target as Reactive<any>;
      let prevValue = get(reactive);

      const unsub = subscribeEvent(reactive.changes, (value: unknown) => {
        entries.push({
          nodeName: node.name,
          kind: "reactive",
          previousValue: prevValue,
          nextValue: value,
          timestamp: Date.now(),
          round: currentRound,
          depth: depthByName.get(node.name),
          operation: node.operation,
        });
        prevValue = value;
      });
      disposers.push(unsub);
    } else {
      const event = target as Event<any>;
      const unsub = subscribeEvent(event, (value: unknown) => {
        entries.push({
          nodeName: node.name,
          kind: "event",
          previousValue: undefined,
          nextValue: value,
          timestamp: Date.now(),
          round: currentRound,
          depth: depthByName.get(node.name),
          operation: node.operation,
        });
      });
      disposers.push(unsub);
    }
  }

  // Auto-load from registry if requested
  if (opts?.useRegistry) {
    for (const descriptor of registry.getAll()) {
      attachNode({
        name: descriptor.name,
        kind: descriptor.kind,
        target: descriptor.target,
        emit: descriptor.emit,
      });
    }
  }

  return {
    source<A>(name: string, event: Event<A>, emit: (value: A) => void): void {
      attachNode({
        name,
        kind: "source",
        target: event,
        emit: emit as (value: unknown) => void,
      });
    },

    track<A>(name: string, target: Event<A> | Reactive<A>): void {
      attachNode({
        name,
        kind: "derived",
        target,
      });
    },

    inject(nodeName: string, value: unknown): void {
      const node = nodes.get(nodeName);
      if (!node) {
        const available = Array.from(nodes.keys()).join(", ");
        throw new Error(
          `[synx/debug] No node registered with name "${nodeName}". ` +
            `Available nodes: ${available || "(none)"}`,
        );
      }
      if (node.kind !== "source" || !node.emit) {
        throw new Error(
          `[synx/debug] Node "${nodeName}" is not a source node. ` +
            `Only source nodes (registered with source()) can be injected into.`,
        );
      }
      currentRound++;
      depthByName = computeDepths(nodeName);
      entries.push({
        nodeName,
        kind: "inject",
        previousValue: undefined,
        nextValue: value,
        timestamp: Date.now(),
        round: currentRound,
        depth: 0,
      });
      node.emit(value);
    },

    expect(nodeName: string): NodeAssertion {
      if (!nodes.has(nodeName)) {
        const available = Array.from(nodes.keys()).join(", ");
        throw new Error(
          `[synx/debug] No node registered with name "${nodeName}". ` +
            `Available nodes: ${available || "(none)"}`,
        );
      }
      return createNodeAssertion(nodeName, entries);
    },

    trace(): TraceEntry[] {
      return [...entries];
    },

    traceText(): string {
      return formatTrace(entries);
    },

    reset(): void {
      entries.length = 0;
    },

    dispose(): void {
      for (const fn of disposers) fn();
      disposers.length = 0;
      entries.length = 0;
      nodes.clear();
    },
  };
}
