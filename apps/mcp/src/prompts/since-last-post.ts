import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildWorkflowText } from "./shared.js";

const argsSchema = {
  repo: z
    .string()
    .optional()
    .describe(
      "Repository name to summarize, e.g. 'linkhub-v.1'. Defaults to the git " +
        "repository in the current working directory.",
    ),
  status: z
    .string()
    .optional()
    .describe(
      "'published' (default) or 'draft'. Use 'draft' to review the post in " +
        "LinkHub before it goes live.",
    ),
};

/**
 * How to derive the window from LinkHub itself rather than from a fixed period:
 * the last commit-summary post the user published is the high-water mark.
 */
const ESTABLISH_WINDOW = `The window starts at the user's most recent LinkHub commit summary, so nothing gets posted twice.

1. Call **\`list_my_posts\`** (\`limit: 20\`).
2. Find the newest post with \`source=commit\`. Its \`createdAt\` timestamp is your start boundary — call it \`<START>\`.
3. Use \`--since="<START>"\` (an ISO timestamp is fine: \`--since="2026-07-18T09:12:00Z"\`) on every \`git log\` below.
4. **If there is no such post yet**, this is the user's first commit summary. Fall back to \`--since="14 days ago"\` and say so when you report back, so they know the window you chose.
5. **If there are commits but none since that post**, do not publish anything. Tell the user their last summary is already up to date and stop.

Mention the resolved start date to the user before you publish, so they can correct it.`;

/**
 * `since_last_post` — the incremental variant of `weekly_update`.
 *
 * Instead of a fixed period it reads the user's own LinkHub history to find
 * where the last commit summary stopped, so repeated invocations never
 * double-post the same work.
 */
export function registerSinceLastPost(server: McpServer): void {
  server.registerPrompt(
    "since_last_post",
    {
      title: "Post everything I've shipped since my last LinkHub update",
      description:
        "Like weekly_update, but the time window is derived from LinkHub " +
        "instead of a fixed period: it finds your most recent commit-summary " +
        "post and summarizes only the git work done since then, so nothing is " +
        "posted twice. Same house style, safety pass and " +
        "create_commit_summary_post mapping. Arguments: repo, status.",
      argsSchema,
    },
    (args) => ({
      description: `Summarize everything shipped${
        args.repo ? ` in ${args.repo}` : ""
      } since the last LinkHub commit summary`,
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: buildWorkflowText({
              windowLabel: "everything since the last LinkHub commit summary",
              establishWindow: ESTABLISH_WINDOW,
              periodValue: "since-last-post",
              repo: args.repo?.trim() || undefined,
              status:
                args.status?.trim().toLowerCase() === "draft"
                  ? "draft"
                  : "published",
            }),
          },
        },
      ],
    }),
  );
}
