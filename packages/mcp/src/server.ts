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

export async function startServer(projectRoot: string): Promise<void> {
  const core = new SynxMcpCore(projectRoot);
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

  await server.connect(new StdioServerTransport());
}
