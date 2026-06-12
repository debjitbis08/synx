// MCP transport adapter over SynxMcpCore. Depends on @modelcontextprotocol/sdk
// (install it before building/running: it is excluded from the repo typecheck
// until then — see tsconfig "exclude").
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SynxMcpCore } from "./core";
import { TOOL_DEFS, dispatch } from "./tools";

/**
 * Build a configured MCP server (no transport yet). Accepts an optional
 * pre-built core, primarily so tests can inject a session loaded in-process.
 */
export function createServer(
  projectRoot: string,
  core: SynxMcpCore = new SynxMcpCore(projectRoot),
): Server {
  const server = new Server(
    { name: "synx-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const text = await dispatch(core, name, args ?? {});
      return { content: [{ type: "text", text }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
    }
  });

  return server;
}

/** Start the server on stdio (the CLI entry point). */
export async function startServer(projectRoot: string): Promise<void> {
  const server = createServer(projectRoot);
  await server.connect(new StdioServerTransport());
}
