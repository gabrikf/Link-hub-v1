import { z } from "zod";
import {
  httpUrlSchema,
  postStatusSchema,
  type UpdatePostInput,
} from "@repo/schemas";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LinkHubApiClient } from "../api-client.js";
import { describePost, errorResult, runTool, textResult } from "./shared.js";

const inputSchema = {
  id: z.string().uuid().describe("The id of the post to update. Required."),
  title: z.string().min(1).optional().describe("New title."),
  body: z.string().min(1).optional().describe("New Markdown body."),
  coverImageUrl: httpUrlSchema.optional().describe("New cover image URL."),
  images: z.array(httpUrlSchema).optional().describe("Replace the image list."),
  tags: z.array(z.string()).optional().describe("Replace the tags."),
  status: postStatusSchema
    .optional()
    .describe("Change status to 'draft' or 'published'."),
};

/** `update_post` — PATCH an existing post with any subset of updatable fields. */
export function registerUpdatePost(
  server: McpServer,
  client: LinkHubApiClient,
): void {
  server.registerTool(
    "update_post",
    {
      title: "Update LinkHub post",
      description:
        "Update an existing LinkHub post by id. Provide only the fields you " +
        "want to change (title, body, coverImageUrl, images, tags, status). " +
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
