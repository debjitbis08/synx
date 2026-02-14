/**
 * Graph Instrumentation Macros
 *
 * These functions allow developers to manually annotate FRP code with metadata
 * for graph visualization. In the future, these could be replaced with automatic
 * instrumentation via TypeScript transformers.
 *
 * Usage:
 *   import { $, $$ } from '@synx/frp/graph';
 *
 *   // Single node annotation
 *   const theme = $('theme', E.stepper(selectedTheme, initialTheme));
 *
 *   // Multiple nodes annotation (destructuring)
 *   const [triggerClicked, escapeKey] = $$([
 *     ['triggerClicked', triggerRef.outputs.click],
 *     ['escapeKey', E.filter(windowRef.outputs.keydown, e => e.key === 'Escape')]
 *   ]);
 */

import type { Event } from "./event";
import type { Reactive } from "./reactive";
import { graphTracker, type NodeMetadata, type SourceLocation } from "./graph";

// ============================================================================
// Instrumentation Helpers
// ============================================================================

/**
 * Annotate a single Event or Reactive with a name for graph visualization
 *
 * @example
 * const theme = $('theme', E.stepper(selectedTheme, 'system'));
 */
export function $<T extends Event<any> | Reactive<any>>(
  name: string,
  node: T,
  metadata?: Partial<NodeMetadata>,
): T {
  if (!graphTracker.isEnabled()) {
    return node;
  }

  // Get the existing node ID if it was already tracked
  const existingId = graphTracker.getNodeId(node);

  if (existingId) {
    // Update existing node with the name
    graphTracker.updateNode(existingId, {
      metadata: {
        ...metadata,
        name,
      } as NodeMetadata,
    });
  }

  return node;
}

/**
 * Annotate multiple Events or Reactives at once
 *
 * @example
 * const [theme, isOpen] = $$([
 *   ['theme', E.stepper(selectedTheme, 'system')],
 *   ['isOpen', E.fold(toggleEvents, false, (open, update) => update(open))]
 * ]);
 */
export function $$<T extends Array<[string, Event<any> | Reactive<any>]>>(
  nodes: T,
): { [K in keyof T]: T[K] extends [string, infer U] ? U : never } {
  return nodes.map(([name, node]) => $(name, node)) as any;
}

/**
 * Create a named scope for graph visualization
 *
 * All FRP operations within the scope will be grouped together.
 *
 * @example
 * const dropdown = scope('ThemeDropdown', () => {
 *   const theme = $('theme', E.stepper(...));
 *   const isOpen = $('isOpen', E.fold(...));
 *   return { theme, isOpen };
 * });
 */
export function scope<T>(name: string, fn: () => T): T {
  // TODO: Implement scope tracking
  // For now, just execute the function
  return fn();
}

/**
 * Get error stack trace for source location (internal helper)
 */
function getSourceLocation(): SourceLocation | undefined {
  if (typeof Error !== "undefined") {
    const stack = new Error().stack;
    if (stack) {
      const lines = stack.split("\n");
      // Find first line that's not in graph.macro.ts
      for (const line of lines) {
        const match = line.match(/\((.*):(\d+):(\d+)\)/);
        if (match && !match[1].includes("graph.macro.ts")) {
          return {
            file: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10),
          };
        }
      }
    }
  }
  return undefined;
}

// ============================================================================
// Operation Tracking (Internal)
// ============================================================================

/**
 * Track an operation with metadata
 * Called by Event/Reactive implementations when graph tracking is enabled
 */
export function trackOperation<T extends Event<any> | Reactive<any>>(
  node: T,
  metadata: NodeMetadata,
  inputs: Array<Event<any> | Reactive<any>> = [],
): string {
  if (!graphTracker.isEnabled()) {
    return "";
  }

  // Get input IDs
  const inputIds = inputs
    .map((input) => graphTracker.getNodeId(input))
    .filter((id): id is string => id !== undefined);

  // Determine node type
  const nodeType = isReactive(node) ? "reactive" : "event";

  return graphTracker.trackNode(node, nodeType, metadata, inputIds);
}

/**
 * Type guard for Reactive
 */
function isReactive(obj: any): obj is Reactive<any> {
  return obj && obj.__tag__ === "Reactive";
}
