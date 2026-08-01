import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPostGuidelines } from "./post-guidelines.js";

/** Registers every LinkHub resource on the given server. */
export function registerAllResources(server: McpServer): void {
  registerPostGuidelines(server);
}

export { POST_GUIDELINES, POST_GUIDELINES_URI } from "./post-guidelines.js";
