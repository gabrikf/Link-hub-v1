import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LinkHubApiClient } from "../api-client.js";
import { registerCreatePost } from "./create-post.js";
import { registerListMyPosts } from "./list-my-posts.js";
import { registerUpdatePost } from "./update-post.js";
import { registerDeletePost } from "./delete-post.js";
import { registerCreateCommitSummaryPost } from "./create-commit-summary-post.js";

/** Registers every LinkHub tool on the given server. */
export function registerAllTools(
  server: McpServer,
  client: LinkHubApiClient,
): void {
  registerCreatePost(server, client);
  registerListMyPosts(server, client);
  registerUpdatePost(server, client);
  registerDeletePost(server, client);
  registerCreateCommitSummaryPost(server, client);
}
