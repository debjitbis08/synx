import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server";
import { SynxMcpCore } from "../src/core";
import { build } from "../../../examples/frp/counter.debug";

// Drive the real MCP server end-to-end (ListTools + CallTool through the SDK)
// over an in-memory transport pair. @synx/* aliases resolve to src here, so the
// core is pre-loaded via the importer thunk (synx_load-by-path is exercised
// separately by the subprocess smoke test, where node+tsx share one module
// graph). createServer accepts an injected core for exactly this purpose.
async function connect(core?: SynxMcpCore): Promise<Client> {
  const server = createServer(process.cwd(), core);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" }, { capabilities: {} });
  await client.connect(clientT);
  return client;
}

async function text(client: Client, name: string, args: Record<string, unknown>) {
  const res = await client.callTool({ name, arguments: args });
  return (res.content as Array<{ type: string; text: string }>)[0].text;
}

describe("MCP server (in-memory transport)", () => {
  it("lists all synx tools", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "synx_assert",
      "synx_graph",
      "synx_history",
      "synx_inject",
      "synx_load",
      "synx_reset",
      "synx_trace",
    ]);
  });

  it("inject -> assert -> trace round trip on a loaded session", async () => {
    const core = new SynxMcpCore();
    await core.load(() => Promise.resolve(build()));
    const client = await connect(core);

    expect(await text(client, "synx_graph", {})).toMatch(/count\s+\[fold\]/);

    const injected = await text(client, "synx_inject", { node: "increment", value: null });
    expect(injected).toContain("count");
    expect(injected).toContain("[fold]");

    expect(await text(client, "synx_assert", { node: "count", expected: 1 })).toContain("PASS");
    expect(await text(client, "synx_assert", { node: "count", expected: 9 })).toContain("FAIL");
    expect(await text(client, "synx_trace", {})).toContain("inject:");
  });

  it("reports errors as tool results, not crashes", async () => {
    const client = await connect(); // no component loaded
    const res = await client.callTool({ name: "synx_graph", arguments: {} });
    expect(res.isError).toBe(true);
    expect((res.content as Array<{ text: string }>)[0].text).toContain(
      "No component loaded",
    );
  });
});
