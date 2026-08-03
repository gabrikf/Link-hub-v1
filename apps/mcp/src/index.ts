#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LinkHubApiClient } from "./api-client.js";
import { ConfigError, loadConfig } from "./config.js";
import { loadDisclosureContext } from "./disclosure.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";

const SERVER_NAME = "linkhub";
const SERVER_VERSION = "1.0.0";

async function main(): Promise<void> {
  // Fail fast with a clear message if the PAT is missing/misconfigured.
  const config = loadConfig();

  const client = new LinkHubApiClient(config);

  // Fetched ONCE, before anything is registered: the disclosure contract has to
  // be baked into tool descriptions and prompt text, which the host agent reads
  // before it calls a single tool. A policy discovered mid-conversation arrives
  // after the agent has already decided what to write. Failure here is not
  // fatal — `loadDisclosureContext` falls back to the strictest level and says
  // so on every surface, which is the safe direction to fail.
  const disclosure = await loadDisclosureContext(client);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAllTools(server, client, disclosure);
  // Prompts + resources are how the host agent learns the commits-to-post
  // workflow, the house style and the privacy contract natively, without the
  // user pasting rules.
  registerAllPrompts(server, disclosure);
  registerAllResources(server, disclosure);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the JSON-RPC stream, so log to stderr.
  console.error(`LinkHub MCP server running on stdio (API: ${config.apiUrl})`);

  if (disclosure.degraded) {
    console.error(
      "[LinkHub MCP] Could not read your disclosure policy — assuming the " +
        "strictest level ('summary'). Create a token with the profile:read " +
        "scope in LinkHub settings to let this server read your real policy " +
        `and work history. Reason: ${disclosure.degradedReason}`,
    );
  } else {
    console.error(
      `[LinkHub MCP] Disclosure level: ${disclosure.level} (${disclosure.info.label})`,
    );
  }
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(`\n[LinkHub MCP] Configuration error:\n${err.message}\n`);
  } else {
    const detail =
      err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`\n[LinkHub MCP] Fatal error:\n${detail}\n`);
  }
  process.exit(1);
});
