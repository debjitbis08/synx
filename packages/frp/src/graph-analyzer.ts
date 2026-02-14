/**
 * Static Analysis Tool for FRP Graph Visualization
 *
 * Parses TypeScript source files to extract FRP operations and generate
 * dependency graphs WITHOUT running the code.
 */

import ts from "typescript";

// ============================================================================
// Types
// ============================================================================

interface AnalyzedNode {
  name: string;
  type: "event" | "reactive" | "unknown";
  operation: string;
  location: {
    file: string;
    line: number;
    column: number;
  };
  inputs: string[];
  rawCode?: string;
}

interface AnalyzedGraph {
  nodes: AnalyzedNode[];
  edges: Array<{ from: string; to: string }>;
  sourceFile: string;
}

// ============================================================================
// FRP Operation Patterns
// ============================================================================

const EVENT_OPERATIONS = new Set([
  "create",
  "of",
  "never",
  "map",
  "filter",
  "mergeAll",
  "mergeWith",
  "fold",
  "stepper",
  "zip",
  "switchE",
  "switchR",
  "snapshot",
  "sample",
  "tag",
  "debounce",
  "throttle",
  "when",
  "whenR",
  "apply",
  "effect",
]);

const REACTIVE_OPERATIONS = new Set([
  "of",
  "create",
  "map",
  "chain",
  "ap",
  "effect",
  "sample",
]);

// ============================================================================
// AST Analysis
// ============================================================================

/**
 * Check if a call expression is an FRP operation
 */
function isFRPCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  const expr = node.expression;

  // E.map(...), R.map(...), event.map(...)
  if (ts.isPropertyAccessExpression(expr)) {
    const obj = expr.expression;
    if (!expr.name) {
      return false;
    }
    const method = expr.name.text;

    // Check for E.* or R.* namespace calls
    if (ts.isIdentifier(obj) && obj.text) {
      const objName = obj.text;
      if (objName === "E" && EVENT_OPERATIONS.has(method)) {
        return true;
      }
      if (objName === "R" && REACTIVE_OPERATIONS.has(method)) {
        return true;
      }
    }

    // Check for event.map(...) or reactive.map(...) style
    if (EVENT_OPERATIONS.has(method) || REACTIVE_OPERATIONS.has(method)) {
      return true;
    }
  }

  // Helper functions like map2, mediaQueryMatches, etc.
  if (ts.isIdentifier(node.expression) && node.expression.text) {
    const name = node.expression.text;
    if (
      name === "map2" ||
      name === "mediaQueryMatches" ||
      name === "bindLocalStorage"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get the operation name from a call expression
 */
function getOperationName(node: ts.CallExpression): string {
  const expr = node.expression;

  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name?.text || "unknown";
  }

  if (ts.isIdentifier(expr) && expr.text) {
    return expr.text;
  }

  return "unknown";
}

/**
 * Determine if operation produces Event or Reactive
 */
function getNodeType(operation: string, expr: ts.Expression): "event" | "reactive" | "unknown" {
  // Namespace-based detection
  if (ts.isPropertyAccessExpression(expr)) {
    const obj = expr.expression;
    if (ts.isIdentifier(obj) && obj.text) {
      if (obj.text === "E") return "event";
      if (obj.text === "R") return "reactive";
    }
  }

  // Operation-based detection
  if (operation === "stepper" || operation === "fold") {
    return "reactive";
  }

  if (
    ["map", "filter", "mergeAll", "zip", "debounce", "throttle"].includes(
      operation,
    )
  ) {
    // Could be either - would need type checking
    return "unknown";
  }

  return "unknown";
}

/**
 * Extract variable names referenced in an expression
 */
function extractReferencedVariables(node: ts.Node): string[] {
  const variables: string[] = [];

  function visit(n: ts.Node) {
    if (ts.isIdentifier(n) && n.text) {
      const name = n.text;
      // Filter out namespace identifiers and known globals
      if (
        name !== "E" &&
        name !== "R" &&
        !EVENT_OPERATIONS.has(name) &&
        !REACTIVE_OPERATIONS.has(name)
      ) {
        variables.push(name);
      }
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return [...new Set(variables)]; // Deduplicate
}

/**
 * Analyze a TypeScript source file
 */
export function analyzeSourceFile(
  sourceFile: ts.SourceFile,
): AnalyzedGraph {
  const nodes: AnalyzedNode[] = [];
  const nodesByName = new Map<string, AnalyzedNode>();

  function visit(node: ts.Node) {
    try {
      // Look for: const varName = E.map(...)
      if (ts.isVariableDeclaration(node)) {
        const name = node.name;

        if (ts.isIdentifier(name) && node.initializer) {
          const varName = name.text;
          const initializer = node.initializer;

          if (isFRPCall(initializer)) {
            const operation = getOperationName(initializer);
            const type = getNodeType(operation, initializer.expression);
            const inputs = extractReferencedVariables(initializer);

            let line = 0, character = 0;
            try {
              const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
              line = pos.line;
              character = pos.character;
            } catch (e) {
              // Fallback if getStart fails
              line = 0;
              character = 0;
            }

            const analyzedNode: AnalyzedNode = {
              name: varName,
              type,
              operation,
              location: {
                file: sourceFile.fileName,
                line: line + 1,
                column: character + 1,
              },
              inputs,
              rawCode: node.getText(sourceFile),
            };

            nodes.push(analyzedNode);
            nodesByName.set(varName, analyzedNode);
          }
        }
      }

      ts.forEachChild(node, visit);
    } catch (error) {
      // Log error but continue processing
      console.error(`Error processing node: ${error}`);
      if (error instanceof Error && error.stack) {
        console.error(`Stack: ${error.stack.split('\n')[1]}`);
      }
      if (node && sourceFile) {
        try {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          console.error(`  at line ${line + 1} in ${sourceFile.fileName}`);
        } catch (e) {
          // Skip if unable to get position
        }
        console.error(`  node kind: ${ts.SyntaxKind[node.kind]}`);
      }
    }
  }

  visit(sourceFile);

  // Build edges based on variable references
  const edges: Array<{ from: string; to: string }> = [];
  for (const node of nodes) {
    for (const input of node.inputs) {
      if (nodesByName.has(input)) {
        edges.push({ from: input, to: node.name });
      }
    }
  }

  return {
    nodes,
    edges,
    sourceFile: sourceFile.fileName,
  };
}

/**
 * Analyze a TypeScript file by path
 */
export function analyzeFile(filePath: string): AnalyzedGraph {
  const program = ts.createProgram([filePath], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (!sourceFile) {
    throw new Error(`Could not load file: ${filePath}`);
  }

  return analyzeSourceFile(sourceFile);
}

// ============================================================================
// Graph Export Formats
// ============================================================================

/**
 * Export as Mermaid diagram
 */
export function exportMermaid(graph: AnalyzedGraph): string {
  const lines: string[] = ["graph LR"];

  // Nodes
  for (const node of graph.nodes) {
    const shape = node.type === "event" ? "[" : node.type === "reactive" ? "(" : "[[";
    const shapeEnd = node.type === "event" ? "]" : node.type === "reactive" ? ")" : "]]";
    const typeLabel = node.type !== "unknown" ? `<br/>${node.type}` : "";
    lines.push(`  ${node.name}${shape}${node.name}${typeLabel}${shapeEnd}`);
  }

  // Edges
  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }

  return lines.join("\n");
}

/**
 * Export as Graphviz DOT
 */
export function exportDOT(graph: AnalyzedGraph): string {
  const lines: string[] = ["digraph FRP {"];
  lines.push("  rankdir=LR;");
  lines.push("  node [shape=box, style=rounded];");
  lines.push("");

  // Nodes
  for (const node of graph.nodes) {
    const color =
      node.type === "event"
        ? "lightblue"
        : node.type === "reactive"
          ? "lightgreen"
          : "lightgray";
    const typeLabel = node.type !== "unknown" ? `\\n(${node.type})` : "";
    lines.push(
      `  ${node.name} [label="${node.name}${typeLabel}", fillcolor="${color}", style="rounded,filled"];`,
    );
  }

  lines.push("");

  // Edges
  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} -> ${edge.to};`);
  }

  lines.push("}");
  return lines.join("\n");
}

/**
 * Export as D3.js JSON
 */
export function exportD3(graph: AnalyzedGraph): {
  nodes: any[];
  links: any[];
} {
  const nodes = graph.nodes.map((node, index) => ({
    id: node.name,
    name: node.name,
    type: node.type,
    operation: node.operation,
    group: node.type === "event" ? 1 : node.type === "reactive" ? 2 : 3,
    location: node.location,
  }));

  const links = graph.edges.map((edge) => ({
    source: edge.from,
    target: edge.to,
  }));

  return { nodes, links };
}

/**
 * Export as JSON
 */
export function exportJSON(graph: AnalyzedGraph): string {
  return JSON.stringify(graph, null, 2);
}

/**
 * Print graph summary to console
 */
export function printGraph(graph: AnalyzedGraph): void {
  console.log("=== FRP Graph Analysis ===");
  console.log(`Source: ${graph.sourceFile}`);
  console.log(`Nodes: ${graph.nodes.length}`);
  console.log(`Edges: ${graph.edges.length}`);
  console.log("");

  console.log("Nodes:");
  for (const node of graph.nodes) {
    const location = `${node.location.file}:${node.location.line}`;
    console.log(`  ${node.name} (${node.type}) [${node.operation}] @ ${location}`);
    if (node.inputs.length > 0) {
      console.log(`    inputs: ${node.inputs.join(", ")}`);
    }
  }

  console.log("");
  console.log("Edges:");
  for (const edge of graph.edges) {
    console.log(`  ${edge.from} -> ${edge.to}`);
  }
}
