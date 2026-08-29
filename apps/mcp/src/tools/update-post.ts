import { z } from "zod";
import {
  httpUrlSchema,
  postStatusSchema,
  type UpdatePostInput,
} from "@repo/schemas";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CraftHubApiClient } from "../api-client.js";
import { describePost, errorResult, runTool, textResult } from "./shared.js";

const inputSchema = {
  id: z.string().uuid().describe("The id of the post to update. Required."),
  title: z.string().min(1).optional().describe("New title."),
  body: z.string().min(1).optional().describe("New Markdown body."),
  coverImageUrl: httpUrlSchema.optional().describe("New cover image URL."),
  images: z.array(httpUrlSchema).optional().describe("Replace the image list."),
  externalUrl: httpUrlSchema
    .optional()
    .describe(
      "New canonical link for the post (http/https) — the PR, release, repo, " +
        "demo or article it points at.",
    ),
  tags: z.array(z.string()).optional().describe("Replace the tags."),
  status: postStatusSchema
    .optional()
    .describe(
      "Change status. Only 'draft' -> 'published' is accepted here. A post " +
        "in 'pending_review' is waiting for the user, and only the user, " +
        "signed in to CraftHub, can publish it — publishing it from this tool " +
        "is refused with 403, so ask them to approve it in the app instead. " +
        "A published post can never be moved back to 'draft' or " +
        "'pending_review' — take it down with delete_post instead.",
    ),
};

/** `update_post` — PATCH an existing post with any subset of updatable fields. */
export function registerUpdatePost(
  server: McpServer,
  client: CraftHubApiClient,
): void {
  server.registerTool(
    "update_post",
    {
      title: "Update CraftHub post",
      description:
        "Update an existing CraftHub post by id. Provide only the fields you " +
        "want to change (title, body, coverImageUrl, images, externalUrl, " +
        "tags, status). IMPORTANT: only posts the user wrote themselves " +
        "(source='manual') accept content edits. A machine-authored post " +
        "(source='mcp', 'agent' or 'commit' — including every post created " +
        "through this MCP server) accepts a STATUS CHANGE AND NOTHING ELSE; " +
        "any attempt to change its title, body, tags, images, links or " +
        "metadata is rejected with 403. That is deliberate: a reader can only " +
        "trust an auto-generated post if it was not polished afterwards. To " +
        "change what such a post says, delete it and write a new one. " +
        "Returns the updated post summary.",
      inputSchema,
    },
    async (args) =>
      runTool(async () => {
        const { id, ...rest } = args;

        // Only send fields the caller actually provided.
        const patch: UpdatePostInput = {};
        if (rest.title !== undefined) patch.title = rest.title;
        if (rest.body !== undefined) patch.body = rest.body;
        if (rest.coverImageUrl !== undefined)
          patch.coverImageUrl = rest.coverImageUrl;
        if (rest.images !== undefined) patch.images = rest.images;
        if (rest.externalUrl !== undefined)
          patch.externalUrl = rest.externalUrl;
        if (rest.tags !== undefined) patch.tags = rest.tags;
        if (rest.status !== undefined) patch.status = rest.status;

        if (Object.keys(patch).length === 0) {
          return errorResult(
            "Nothing to update: provide at least one field to change.",
          );
        }

        const post = await client.updatePost(id, patch);
        return textResult(describePost(post, "Post updated ✅"));
      }),
  );
}
