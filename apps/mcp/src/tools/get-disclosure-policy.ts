import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CraftHubApiClient } from "../api-client.js";
import { levelInfo, type DisclosureContext } from "../disclosure.js";
import { runTool, textResult } from "./shared.js";

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * `get_disclosure_policy` — what am I allowed to say?
 *
 * Re-fetches rather than replaying the startup snapshot, because the user may
 * change the policy in a browser tab while the session is open; the startup
 * copy is only there to shape descriptions that are read before any tool runs.
 */
export function registerGetDisclosurePolicy(
  server: McpServer,
  client: CraftHubApiClient,
  startupContext: DisclosureContext,
): void {
  server.registerTool(
    "get_disclosure_policy",
    {
      title: "Get my disclosure policy",
      description:
        "Return the user's current disclosure level and its exact allow/block " +
        "lists — what you may say about where they work and what you must never " +
        "say. Call this before writing anything that touches employment history " +
        "if you are unsure, and whenever a post is rejected for naming a blocked " +
        "term. CraftHub enforces this policy server-side; it is not advisory. The " +
        "user changes it in CraftHub settings — you cannot, and must not offer to. " +
        "Requires the profile:read token scope.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        let level = startupContext.level;
        let blockedTerms: readonly string[] = startupContext.blockedTerms;
        let degradedNote = "";

        try {
          const policy = await client.getAgentPolicy();
          level = policy.disclosureLevel;
          blockedTerms = policy.blockedTerms;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          degradedNote =
            `\n\n> Could not read the live policy, so the STRICTEST level is assumed.` +
            `\n> Reason: ${reason}`;
          level = "summary";
          blockedTerms = [];
        }

        const info = levelInfo(level);

        const blocksSection =
          info.blocks.length > 0
            ? bullets(info.blocks)
            : "_Nothing at this level beyond the user's own blocked terms._";

        const termsSection =
          blockedTerms.length > 0
            ? `\n\n## Terms the user banned outright (blocked at every level)\n\n${bullets(blockedTerms)}`
            : "";

        return textResult(
          `# Disclosure level: \`${info.value}\` — ${info.label}${degradedNote}\n\n` +
            `${info.shortDescription}\n\n` +
            `## You may say\n\n${bullets(info.allows)}\n\n` +
            `## You must not say\n\n${blocksSection}${termsSection}\n\n` +
            `Enforced server-side: a post containing a blocked employer or client ` +
            `name is rejected with HTTP 400 naming the term. Rewrite around it — ` +
            `retrying the same text will fail again. For employment facts use ` +
            `\`get_work_context\`, never the git remote or the directory name.`,
        );
      }),
  );
}
