import { z } from "zod";
import { httpUrlSchema, postStatusSchema } from "@repo/schemas";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CraftHubApiClient } from "../api-client.js";
import {
  renderPolicyForToolDescription,
  type DisclosureContext,
} from "../disclosure.js";
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
    .describe(
      "2–5 lowercase tags naming the technologies the work touched, e.g. " +
        '["typescript", "fastify", "postgres"]. Always pass them: tags (and ' +
        "the title) are embedded at twice the body's weight for recruiter " +
        "search, so a post without technology tags is invisible to a " +
        "stack-filtered search. Real technology names, never generic words " +
        'like "update".',
    ),
  status: postStatusSchema
    .optional()
    .describe(
      "'draft', 'pending_review' or 'published'. Defaults to 'published'. " +
        "Use 'pending_review' whenever you are posting unattended — i.e. the " +
        "user has not read this exact text in this session. The post stays " +
        "private until the human approves it, and its content is then frozen, " +
        "which is what makes it trustworthy to a reader.",
    ),
  workExperienceId: z
    .uuid()
    .optional()
    .describe(
      "Optional id of the role this post came out of (from get_work_context). " +
        "The post then inherits that role's disclosure level instead of the " +
        "account default.",
    ),
};

/**
 * `create_post` — create a CraftHub post authored from an MCP client.
 * The post is stored with source='mcp'.
 */
export function registerCreatePost(
  server: McpServer,
  client: CraftHubApiClient,
  disclosure: DisclosureContext,
): void {
  server.registerTool(
    "create_post",
    {
      title: "Create CraftHub post",
      description:
        "Create a new post on the user's CraftHub profile. Provide the body in " +
        "Markdown; title, cover image, images, external URL and status are " +
        "optional. Always include `tags` naming the technologies — recruiter " +
        "search embeds the title and tags at twice the body's weight, so a " +
        "post without them is effectively unfindable. The post is tagged with " +
        "source='mcp'. Returns the new post id and a shareable summary. For a " +
        "summary of recent git work, use create_commit_summary_post instead. " +
        "If this post is being written " +
        "unattended (no human is reading it right now), send " +
        "status='pending_review' so the user approves it before it goes " +
        "public. Once created, an MCP-authored post cannot be edited — only " +
        "approved or deleted. " +
        renderPolicyForToolDescription(disclosure),
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
          ...(args.workExperienceId
            ? { workExperienceId: args.workExperienceId }
            : {}),
        });
        return textResult(describePost(post, "Post created ✅"));
      }),
  );
}
