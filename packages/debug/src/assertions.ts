import type { TraceEntry } from "./trace";

export interface NodeAssertion {
  /** Assert that this value appeared in emissions (deep equality) */
  toHaveEmitted(value: unknown): void;
  /** Assert that nothing was emitted */
  toNotHaveEmitted(): void;
  /** Assert the full emission sequence matches */
  toHaveHistory(values: unknown[]): void;
  /** Assert the most recent emission equals this value */
  toHaveLastEmitted(value: unknown): void;
}

export function createNodeAssertion(
  nodeName: string,
  entries: TraceEntry[],
): NodeAssertion {
  const nodeEntries = entries.filter(
    (e) => e.nodeName === nodeName && e.kind !== "inject",
  );
  const emittedValues = nodeEntries.map((e) => e.nextValue);

  return {
    toHaveEmitted(value: unknown): void {
      const found = emittedValues.some((v) => deepEqual(v, value));
      if (!found) {
        throw new Error(
          `Expected "${nodeName}" to have emitted ${fmt(value)}, ` +
            `but emissions were: [${emittedValues.map(fmt).join(", ")}]`,
        );
      }
    },

    toNotHaveEmitted(): void {
      if (nodeEntries.length > 0) {
        throw new Error(
          `Expected "${nodeName}" to not have emitted, ` +
            `but it emitted: [${emittedValues.map(fmt).join(", ")}]`,
        );
      }
    },

    toHaveHistory(values: unknown[]): void {
      if (!deepEqual(emittedValues, values)) {
        throw new Error(
          `Expected "${nodeName}" history to be [${values.map(fmt).join(", ")}], ` +
            `but was: [${emittedValues.map(fmt).join(", ")}]`,
        );
      }
    },

    toHaveLastEmitted(value: unknown): void {
      const last =
        emittedValues.length > 0
          ? emittedValues[emittedValues.length - 1]
          : undefined;
      if (!deepEqual(last, value)) {
        throw new Error(
          `Expected "${nodeName}" last emission to be ${fmt(value)}, ` +
            `but was: ${fmt(last)}`,
        );
      }
    },
  };
}

function fmt(v: unknown): string {
  if (v === undefined) return "undefined";
  return JSON.stringify(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
}
