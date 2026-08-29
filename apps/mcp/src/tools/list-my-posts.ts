import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CraftHubApiClient } from "../api-client.js";
import { runTool, summarizePostLine, textResult } from "./shared.js";

const inputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Max posts to return (1-100, default 20)."),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of posts to skip for pagination (default 0)."),
};

/** `list_my_posts` — list the authenticated user's posts. */
export function registerListMyPosts(
  server: McpServer,
  client: CraftHubApiClient,
): void {
  server.registerTool(
    "list_my_posts",
    {
      title: "List my CraftHub posts",
      description:
        "List the authenticated user's CraftHub posts (most recent first), " +
        "returning id, title, status, source and createdAt for each. Supports " +
        "limit/offset pagination.",
      inputSchema,
    },
    async (args) =>
      runTool(async () => {
        const posts = await client.listPosts({
          limit: args.limit,
          offset: args.offset,
        });
        if (posts.length === 0) {
          return textResult("No posts found.");
        }
        const body = posts.map(summarizePostLine).join("\n");
        return textResult(`${posts.length} post(s):\n${body}`);
      }),
  );
}
