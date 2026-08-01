import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWeeklyUpdate } from "./weekly-update.js";
import { registerSinceLastPost } from "./since-last-post.js";

/** Registers every LinkHub workflow prompt on the given server. */
export function registerAllPrompts(server: McpServer): void {
  registerWeeklyUpdate(server);
  registerSinceLastPost(server);
}
