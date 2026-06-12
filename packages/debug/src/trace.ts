export interface TraceEntry {
  nodeName: string;
  kind: "event" | "reactive" | "inject";
  previousValue: unknown;
  nextValue: unknown;
  timestamp: number;
  /** Injection round this entry belongs to (set by session) */
  round: number;
  /** Propagation depth from the injected source (0 = source). Topology-derived. */
  depth?: number;
  /** Operator that produced this node, e.g. "fold". Topology-derived. */
  operation?: string;
}

export function formatTrace(entries: TraceEntry[]): string {
  if (entries.length === 0) return "(no trace entries)";

  // Group by injection round, sort each group: inject first, then events, then reactives
  const rounds = new Map<number, TraceEntry[]>();
  for (const entry of entries) {
    let group = rounds.get(entry.round);
    if (!group) {
      group = [];
      rounds.set(entry.round, group);
    }
    group.push(entry);
  }

  const lines: string[] = [];
  const allNonInject = entries.filter((e) => e.kind !== "inject");
  const maxNameLen = allNonInject.length > 0
    ? Math.max(...allNonInject.map((e) => e.nodeName.length))
    : 0;

  for (const [, group] of rounds) {
    // Sort: inject header first, then by propagation depth, then events before
    // reactives at the same depth.
    group.sort((a, b) => {
      const order = { inject: 0, event: 1, reactive: 2 };
      const byDepth = (a.depth ?? 0) - (b.depth ?? 0);
      if (a.kind === "inject" || b.kind === "inject") {
        return order[a.kind] - order[b.kind];
      }
      return byDepth !== 0 ? byDepth : order[a.kind] - order[b.kind];
    });

    for (const entry of group) {
      if (entry.kind === "inject") {
        lines.push(`inject: ${entry.nodeName} = ${formatValue(entry.nextValue)}`);
      } else {
        const verb = entry.kind === "event" ? "emitted" : "updated";
        const valueStr =
          entry.kind === "reactive"
            ? `${formatValue(entry.previousValue)} -> ${formatValue(entry.nextValue)}`
            : formatValue(entry.nextValue);

        // Indent by propagation depth (2 spaces per level; depth 0 = 1 level).
        const indent = "  ".repeat((entry.depth ?? 0) + 1);
        const nameCol = entry.nodeName.padEnd(maxNameLen);
        const opTag = entry.operation ? `  [${entry.operation}]` : "";
        lines.push(`${indent}${nameCol}  ${verb.padEnd(8)}  ${valueStr}${opTag}`);
      }
    }
  }

  return lines.join("\n");
}

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
