import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DisclosureContext } from "../disclosure.js";
import { registerPostGuidelines } from "./post-guidelines.js";
import { registerDisclosurePolicy } from "./disclosure-policy.js";

/** Registers every CraftHub resource on the given server. */
export function registerAllResources(
  server: McpServer,
  disclosure: DisclosureContext,
): void {
  registerPostGuidelines(server);
  registerDisclosurePolicy(server, disclosure);
}

export { POST_GUIDELINES, POST_GUIDELINES_URI } from "./post-guidelines.js";
export { DISCLOSURE_POLICY_URI } from "./disclosure-policy.js";
