import { z } from "zod";
import { postStatusSchema } from "@repo/schemas";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LinkHubApiClient } from "../api-client.js";
import { describePost, runTool, textResult } from "./shared.js";

const inputSchema = {
  summary: z
    .string()
    .min(1)
    .describe(
      "The finished, recruiter-friendly post body in Markdown. YOU (the host " +
        "agent) must write this: read the git log, then compose prose about " +
        "WHAT WAS SHIPPED and its impact (features, improvements, fixes) — not " +
        "a raw dump of commit messages. This tool does not summarize anything " +
        "itself; it only publishes the text you pass here.",
    ),
  period: z
    .string()
    .optional()
    .describe(
      "Time span the summary covers, e.g. 'daily', 'weekly', 'monthly', or a " +
        "range like '2026-07-01..2026-07-07'.",
    ),
  repo: z
    .string()
    .optional()
    .describe("Repository name the work happened in, e.g. 'linkhub-v.1'."),
  commitCount: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Number of commits this summary is based on."),
  title: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional headline. If omitted, a reasonable one is derived from repo/period.",
    ),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags, e.g. ['changelog', 'shipped']."),
  status: postStatusSchema
    .optional()
    .describe("'draft' or 'published'. Defaults to 'published'."),
};

/** Derives a fallback title from repo/period when the caller omits one. */
function deriveTitle(repo?: string, period?: string): string {
  const scope = repo ? `${repo}` : "Project";
  const when = period ? ` — ${period} update` : " update";
  return `${scope}${when}`;
}

/**
 * `create_commit_summary_post` — the "turn my commits into a post" tool.
 *
 * Design intent: the HOST agent reads `git log`, writes a polished summary of
 * what shipped, then calls this tool to publish it. The post is stored with
 * source='commit' and metadata={ repo, commitCount, period }. This tool performs
 * NO AI/summarization — it only persists the summary the host composed.
 */
export function registerCreateCommitSummaryPost(
  server: McpServer,
  client: LinkHubApiClient,
): void {
  server.registerTool(
    "create_commit_summary_post",
    {
      title: "Publish a commit summary post",
      description:
        "Publish a summary of recent git work to the user's LinkHub profile, " +
        "where recruiters and hiring managers read it. THIS TOOL RUNS NO AI: " +
        "it publishes `summary` verbatim, so the post is only as good as the " +
        "text you send. Before calling it, collect from the repository: (a) the " +
        "repo name, (b) the number of the user's own commits in the period " +
        "(`git log --since=... --author=... --no-merges`), (c) the 2-5 " +
        "user-visible capabilities that actually shipped — collapse many " +
        "commits about one feature into one item and drop wip/format/dep " +
        "commits, (d) the impact of each on a user or the system, (e) any real " +
        "metric you can verify in the diff (latency, bundle size, coverage, " +
        "endpoints, rows migrated) — never invent one, (f) the stack actually " +
        "touched, by searchable name ('TypeScript, Fastify, PostgreSQL'), and " +
        "(g) a public link to the shipped work if one exists. Then write " +
        "`summary` as 80-200 words of first-person Markdown describing OUTCOMES, " +
        "not mechanics. NEVER pass raw commit messages, SHAs, branch names, " +
        "ticket ids, secrets or private client detail. Always pass an explicit " +
        "`title` (<70 chars). Use status='draft' if the user has not approved " +
        "the text. Full house style: read the resource " +
        "linkhub://guides/post-quality, or invoke the `weekly_update` prompt " +
        "for the whole guided workflow. Saved with source='commit' and " +
        "metadata { repo, commitCount, period }.",
      inputSchema,
    },
    async (args) =>
      runTool(async () => {
        const metadata: Record<string, string | number | boolean> = {};
        if (args.repo !== undefined) metadata.repo = args.repo;
        if (args.commitCount !== undefined)
          metadata.commitCount = args.commitCount;
        if (args.period !== undefined) metadata.period = args.period;

        const post = await client.createPost({
          source: "commit",
          title: args.title ?? deriveTitle(args.repo, args.period),
          body: args.summary,
          tags: args.tags ?? null,
          status: args.status ?? "published",
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        });

        return textResult(describePost(post, "Commit summary published ✅"));
      }),
  );
}
