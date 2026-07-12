#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LinkHubApiClient } from "./api-client.js";
import { ConfigError, loadConfig } from "./config.js";
import { registerAllTools } from "./tools/index.js";

const SERVER_NAME = "linkhub";
const SERVER_VERSION = "1.0.0";

async function main(): Promise<void> {
  // Fail fast with a clear message if the PAT is missing/misconfigured.
  const config = loadConfig();

  const client = new LinkHubApiClient(config);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerAllTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // stdout is reserved for the JSON-RPC stream, so log to stderr.
  console.error(
    `LinkHub MCP server running on stdio (API: ${config.apiUrl})`,
  );
}

main().catch((err) => {
  if (err instanceof ConfigError) {
    console.error(`\n[LinkHub MCP] Configuration error:\n${err.message}\n`);
  } else {
    const detail = err instanceof Error ? err.stack ?? err.message : String(err);
    console.error(`\n[LinkHub MCP] Fatal error:\n${detail}\n`);
  }
  process.exit(1);
});
