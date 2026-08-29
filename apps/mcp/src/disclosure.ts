import {
  AGENT_DISCLOSURE_LEVELS,
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
  type AgentDisclosureLevelInfo,
  type AgentPolicy,
} from "@repo/schemas";
import type { CraftHubApiClient } from "./api-client.js";

/**
 * The active disclosure contract, resolved once at startup.
 *
 * It is fetched eagerly rather than per-call because the contract has to travel
 * with the CONNECTION: tool descriptions and prompt text are read by the host
 * agent before it ever calls a tool, so a policy discovered mid-conversation
 * would arrive too late to shape what the agent writes.
 */
export interface DisclosureContext {
  readonly level: AgentDisclosureLevel;
  readonly info: AgentDisclosureLevelInfo;
  /** Terms the user banned outright, whatever the level. Empty when unknown. */
  readonly blockedTerms: readonly string[];
  /**
   * True when the policy could not be read (usually a token without
   * `profile:read`). The server then assumes the strictest level and says so,
   * rather than quietly behaving as if nothing were restricted.
   */
  readonly degraded: boolean;
  /** Why the policy could not be read, when `degraded`. */
  readonly degradedReason?: string;
}

export function levelInfo(
  level: AgentDisclosureLevel,
): AgentDisclosureLevelInfo {
  return (
    AGENT_DISCLOSURE_LEVELS.find((entry) => entry.value === level) ??
    AGENT_DISCLOSURE_LEVELS[0]
  );
}

/**
 * Reads the policy from CraftHub, falling back to the strictest level when the
 * token cannot see it. Failing closed is the only safe default: an agent that
 * assumed "no policy" on a network blip would publish the employer's name.
 */
export async function loadDisclosureContext(
  client: CraftHubApiClient,
): Promise<DisclosureContext> {
  try {
    const policy: AgentPolicy = await client.getAgentPolicy();
    return {
      level: policy.disclosureLevel,
      info: levelInfo(policy.disclosureLevel),
      blockedTerms: policy.blockedTerms,
      degraded: false,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      level: DEFAULT_AGENT_DISCLOSURE_LEVEL,
      info: levelInfo(DEFAULT_AGENT_DISCLOSURE_LEVEL),
      blockedTerms: [],
      degraded: true,
      degradedReason: reason,
    };
  }
}

function bullets(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

/**
 * The policy rendered as instructions, for embedding in a tool description or
 * prompt. Kept compact — a tool description competing for context budget with
 * the actual task should not run to a page.
 */
export function renderPolicyForToolDescription(
  context: DisclosureContext,
): string {
  const prefix = context.degraded
    ? "DISCLOSURE POLICY (could not be read from CraftHub — assuming the STRICTEST level; " +
      "the token is probably missing the profile:read scope): "
    : "DISCLOSURE POLICY: ";

  return (
    `${prefix}the user's level is "${context.info.value}" (${context.info.label}) — ` +
    `${context.info.shortDescription} ` +
    `YOU MAY SAY: ${context.info.allows.join("; ")}. ` +
    (context.info.blocks.length > 0
      ? `YOU MUST NOT SAY: ${context.info.blocks.join("; ")}. `
      : "Nothing is blocked at this level beyond the user's own blocked terms. ") +
    `CraftHub ENFORCES this server-side: a post containing a blocked employer or ` +
    `client name is rejected with a 400 naming the term, so write around it rather ` +
    `than trying again verbatim. Never infer the employer from git remotes, package ` +
    `names, directory paths or code comments — call get_work_context for anything ` +
    `you need to know about where the user worked.`
  );
}

/** The full contract, for the `crafthub://policy/disclosure` resource. */
export function renderPolicyResource(context: DisclosureContext): string {
  const degradedNote = context.degraded
    ? `\n> **This is a fallback.** The policy could not be read from CraftHub, so the\n> strictest level is assumed. Reason: ${context.degradedReason ?? "unknown"}\n`
    : "";

  const blockedTermsSection =
    context.blockedTerms.length > 0
      ? `\n## Terms the user banned outright\n\nThese are blocked at EVERY level, including \`full\`:\n\n${bullets(
          context.blockedTerms,
        )}\n`
      : "";

  return `# Active disclosure policy${degradedNote}

**Level: \`${context.info.value}\` — ${context.info.label}**

${context.info.shortDescription}

## What you may say

${bullets(context.info.allows)}

## What you must not say

${
  context.info.blocks.length > 0
    ? bullets(context.info.blocks)
    : "_Nothing beyond the user's own blocked terms below._"
}
${blockedTermsSection}
## How this is enforced

This is not a suggestion. CraftHub applies the same denylist server-side when a
post is created or updated through a personal access token: a post containing a
blocked employer or client name is rejected with HTTP 400 and a message naming
the offending term. Rewriting the post around the term is the fix; retrying the
same text is not.

The same policy is applied on the read side. \`get_work_context\` returns work
history that has ALREADY been redacted to this level — at \`summary\`, employer
names are stripped from both the fields and the prose.

## Where employment facts come from

\`get_work_context\` is the ONLY sanctioned source. Do not infer the user's
employer or client from git remotes, package names, directory paths, code
comments, README files or commit trailers. Those leak exactly the identifiers
this policy exists to protect.

## Changing it

Only the user can, from a signed-in browser session: CraftHub Settings →
"What your agent may share". A personal access token cannot widen its own
policy, by design — so do not offer to change it for them.
`;
}
