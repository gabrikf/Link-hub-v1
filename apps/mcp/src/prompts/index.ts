import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DisclosureContext } from "../disclosure.js";
import { registerWeeklyUpdate } from "./weekly-update.js";
import { registerSinceLastPost } from "./since-last-post.js";

/** Registers every LinkHub workflow prompt on the given server. */
export function registerAllPrompts(
  server: McpServer,
  disclosure: DisclosureContext,
): void {
  registerWeeklyUpdate(server, disclosure);
  registerSinceLastPost(server, disclosure);
}
