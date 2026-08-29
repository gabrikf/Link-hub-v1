import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CraftHubApiClient } from "../api-client.js";
import { errorResult, runTool, textResult } from "./shared.js";

const inputSchema = {
  id: z.string().uuid().describe("The id of the post to delete. Required."),
};

/** `delete_post` — permanently delete a post by id. */
export function registerDeletePost(
  server: McpServer,
  client: CraftHubApiClient,
): void {
  server.registerTool(
    "delete_post",
    {
      title: "Delete CraftHub post",
      description:
        "Permanently delete one of the user's CraftHub posts by id. This cannot " +
        "be undone.",
      inputSchema,
    },
    async (args) =>
      runTool(async () => {
        const result = await client.deletePost(args.id);
        if (result?.success) {
          return textResult(`Post ${args.id} deleted ✅`);
        }
        return errorResult(`Post ${args.id} could not be deleted.`);
      }),
  );
}
