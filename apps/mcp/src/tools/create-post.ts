import { z } from "zod";
import { httpUrlSchema, postStatusSchema } from "@repo/schemas";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LinkHubApiClient } from "../api-client.js";
import { describePost, runTool, textResult } from "./shared.js";

const inputSchema = {
  title: z
    .string()
    .min(1)
    .optional()
    .describe("Optional post title / headline."),
  body: z
    .string()
    .min(1)
    .describe("Post body in Markdown. Required — this is the main content."),
  coverImageUrl: httpUrlSchema
    .optional()
    .describe("Optional cover image URL (http/https)."),
  images: z
    .array(httpUrlSchema)
    .optional()
    .describe("Optional list of additional image URLs (http/https)."),
  externalUrl: httpUrlSchema
    .optional()
    .describe(
      "Optional canonical link the post points at (http/https) — the PR, " +
        "release, repo, demo or article the post is about.",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags to categorize the post."),
  status: postStatusSchema
    .optional()
    .describe("'draft' or 'published'. Defaults to 'published'."),
};

/**
 * `create_post` — create a LinkHub post authored from an MCP client.
 * The post is stored with source='mcp'.
 */
export function registerCreatePost(
  server: McpServer,
  client: LinkHubApiClient,
): void {
  server.registerTool(
    "create_post",
    {
      title: "Create LinkHub post",
      description:
        "Create a new post on the user's LinkHub profile. Provide the body in " +
        "Markdown; title, cover image, images, external URL, tags and status " +
        "are optional. The post is tagged with source='mcp'. Returns the new " +
        "post id and a shareable summary. For a summary of recent git work, " +
        "use create_commit_summary_post instead.",
      inputSchema,
    },
    async (args) =>
      runTool(async () => {
        const post = await client.createPost({
          source: "mcp",
          title: args.title ?? null,
          body: args.body,
          coverImageUrl: args.coverImageUrl ?? null,
          images: args.images ?? null,
          externalUrl: args.externalUrl ?? null,
          tags: args.tags ?? null,
          status: args.status ?? "published",
        });
        return textResult(describePost(post, "Post created ✅"));
      }),
  );
}
