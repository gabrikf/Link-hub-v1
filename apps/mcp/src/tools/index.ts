import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CraftHubApiClient } from "../api-client.js";
import type { DisclosureContext } from "../disclosure.js";
import { registerCreatePost } from "./create-post.js";
import { registerListMyPosts } from "./list-my-posts.js";
import { registerUpdatePost } from "./update-post.js";
import { registerDeletePost } from "./delete-post.js";
import { registerCreateCommitSummaryPost } from "./create-commit-summary-post.js";
import { registerGetWorkContext } from "./get-work-context.js";
import { registerGetDisclosurePolicy } from "./get-disclosure-policy.js";

/**
 * Registers every CraftHub tool on the given server.
 *
 * `disclosure` is threaded into the post-writing tools so the active policy is
 * part of what the host agent reads BEFORE it composes anything — a rule
 * discovered only after a rejected write is a rule that already leaked.
 */
export function registerAllTools(
  server: McpServer,
  client: CraftHubApiClient,
  disclosure: DisclosureContext,
): void {
  registerCreatePost(server, client, disclosure);
  registerListMyPosts(server, client);
  registerUpdatePost(server, client);
  registerDeletePost(server, client);
  registerCreateCommitSummaryPost(server, client, disclosure);
  registerGetWorkContext(server, client, disclosure);
  registerGetDisclosurePolicy(server, client, disclosure);
}
