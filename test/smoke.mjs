/**
 * Smoke test for the CCC MCP server (not published; run manually).
 * Usage:
 *   node test/smoke.mjs            -> runs no-key tests, then key tests if
 *                                     CCC_SMOKE_KEY is set in the env.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = new URL("../dist/index.js", import.meta.url).pathname;

async function connect(env) {
  const transport = new StdioClientTransport({
    command: "node",
    args: [SERVER],
    env: { ...process.env, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "ccc-smoke-test", version: "1.0.0" }, {});
  await client.connect(transport);
  return { client, transport };
}

function brief(result, max = 1200) {
  const text = result?.content?.map((c) => c.text ?? "").join("\n") ?? "";
  return {
    isError: !!result?.isError,
    chars: text.length,
    preview: text.slice(0, max),
  };
}

const out = {};

// --- Phase 1: no API key ---
{
  const { client, transport } = await connect({ CCC_API_KEY: "" });
  const tools = await client.listTools();
  out.noKey = { toolNames: tools.tools.map((t) => t.name) };
  const call = await client.callTool({
    name: "compare_cloud_pricing",
    arguments: { category: "vm" },
  });
  out.noKey.call = brief(call, 400);
  await transport.close();
}

// --- Phase 2: with a real key ---
const key = process.env.CCC_SMOKE_KEY;
if (key) {
  const { client, transport } = await connect({ CCC_API_KEY: key });
  const tools = await client.listTools();
  out.withKey = { toolNames: tools.tools.map((t) => t.name) };

  const vm = await client.callTool({
    name: "compare_cloud_pricing",
    arguments: { category: "vm" },
  });
  out.withKey.compareVm = brief(vm, 1500);

  const ai = await client.callTool({
    name: "search_ai_models",
    arguments: { provider: "openai" },
  });
  out.withKey.searchAi = brief(ai, 1500);

  const wl = await client.callTool({
    name: "estimate_workload_architecture",
    arguments: { workload_id: "3-tier-web" },
  });
  out.withKey.workload = brief(wl, 1500);

  const dc = await client.callTool({
    name: "lookup_datacenter_compliance",
    arguments: { country_or_city: "Brazil", compliance_standard: "soc2" },
  });
  out.withKey.datacenter = brief(dc, 1200);

  await transport.close();
} else {
  out.withKey = "SKIPPED (CCC_SMOKE_KEY not set)";
}

console.log(JSON.stringify(out, null, 2));
