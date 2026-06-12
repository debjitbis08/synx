import type { SynxMcpCore } from "./core";

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "synx_load",
    description:
      "Load and execute a Synx component file. Executing it populates the " +
      "node registry; returns the graph topology.",
    inputSchema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path to the component file, relative to the project root." },
      },
      required: ["file"],
    },
  },
  {
    name: "synx_graph",
    description: "Return the current component graph (nodes + edges) as text.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "synx_inject",
    description: "Inject a value into a named source node and return the resulting trace.",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Name of the source node to inject into." },
        value: { description: "Value to inject (any JSON value; use null for void events)." },
      },
      required: ["node"],
    },
  },
  {
    name: "synx_assert",
    description: "Assert that a node emitted a value. Returns pass/fail with history.",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string" },
        expected: { description: "Expected emitted value (any JSON value)." },
      },
      required: ["node", "expected"],
    },
  },
  {
    name: "synx_history",
    description: "Return the full emission history of a node since the last reset.",
    inputSchema: {
      type: "object",
      properties: { node: { type: "string" } },
      required: ["node"],
    },
  },
  {
    name: "synx_trace",
    description: "Return the full accumulated trace since the last reset as text.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "synx_reset",
    description: "Clear the session trace history (keeps the component loaded).",
    inputSchema: { type: "object", properties: {} },
  },
];

/** Run a tool by name and return its text result. */
export async function dispatch(
  core: SynxMcpCore,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "synx_load": {
      await core.loadFile(String(args.file));
      return `Loaded ${args.file}\n\n${core.graphText()}`;
    }
    case "synx_graph":
      return core.graphText();
    case "synx_inject":
      return core.inject(String(args.node), args.value).trace || "(no propagation)";
    case "synx_assert":
      return core.assert(String(args.node), args.expected).message;
    case "synx_history": {
      const { history, count } = core.history(String(args.node));
      return JSON.stringify({ history, count });
    }
    case "synx_trace":
      return core.traceText();
    case "synx_reset":
      return core.resetTrace();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
