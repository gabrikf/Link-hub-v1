import { z } from "zod/v4";

/**
 * How much an agent acting on the candidate's behalf (the MCP server, the
 * profile assistant) is allowed to reveal about where they worked.
 *
 * This is a privacy contract, not a UI preference: the same three levels drive
 * the settings screen copy and the redaction the MCP applies before any work
 * history leaves LinkHub. Levels are ordered from most to least restrictive.
 */
export const agentDisclosureLevelSchema = z.enum([
  "summary",
  "detailed",
  "full",
]);

/**
 * The level every account starts on. Deliberately the restrictive one: a user
 * who never opens the settings screen must not leak their employer's name.
 */
export const DEFAULT_AGENT_DISCLOSURE_LEVEL = "summary";

/**
 * Human-readable contract for each level. Rendered verbatim in the settings UI
 * and injected into the MCP system prompt, so `allows` / `blocks` are written
 * as instructions an agent can follow, not as internal notes.
 */
export const AGENT_DISCLOSURE_LEVELS = [
  {
    value: "summary",
    label: "Summary",
    shortDescription:
      "Share what you did and how you did it, never who you did it for.",
    allows: [
      "Role titles and seniority",
      "Start and end dates, and how long each role lasted",
      "Employment type (full-time, contract, freelance) and work model (remote, hybrid, on-site)",
      "Tech stack and tools used",
      "Engineering practices and strategies (TDD, trunk-based development, event-driven architecture, CI/CD, pair programming)",
      "Problem domains described generically (payments, logistics, healthcare scheduling)",
      "Non-identifying outcome metrics (\"cut p95 latency 40%\", \"halved build time\")",
    ],
    blocks: [
      "Employer and client names",
      "Internal repository, service, project and codenames",
      "Ticket and issue ids",
      "Customer names",
      "Unreleased product names",
      "Internal architecture specifics (topology, vendor contracts, infrastructure layout)",
      "Headcount and revenue figures",
      "Any metric that identifies the employer (\"the only Brazilian bank processing 4M PIX/day\")",
    ],
  },
  {
    value: "detailed",
    label: "Detailed",
    shortDescription:
      "Everything in Summary, plus the companies and public work behind it.",
    allows: [
      "Everything allowed at Summary level",
      "Employer name",
      "Public product names",
      "Public repository names and links",
    ],
    blocks: [
      "Internal repository, service, project and codenames",
      "Ticket and issue ids",
      "Customer names",
      "Unreleased product names",
      "Internal architecture specifics (topology, vendor contracts, infrastructure layout)",
      "Headcount and revenue figures",
    ],
  },
  {
    value: "full",
    label: "Full",
    shortDescription:
      "No LinkHub-side restriction — you decide what the agent may say.",
    allows: [
      "Anything present in the profile, work history and posts",
    ],
    blocks: [],
  },
] as const satisfies ReadonlyArray<{
  value: z.infer<typeof agentDisclosureLevelSchema>;
  label: string;
  shortDescription: string;
  allows: readonly string[];
  blocks: readonly string[];
}>;

/**
 * Read model returned by the policy endpoint.
 *
 * `perEmployer` carries one entry per work experience that overrides the
 * account default; the resolved level for a role is its own `disclosureLevel`
 * when present, otherwise the account-level `disclosureLevel`.
 */
export const agentPolicySchema = z.object({
  disclosureLevel: agentDisclosureLevelSchema,
  /** Case-insensitive terms the agent must never emit, whatever the level. */
  blockedTerms: z.array(z.string()),
  perEmployer: z.array(
    z.object({
      workExperienceId: z.string(),
      companyName: z.string(),
      disclosureLevel: agentDisclosureLevelSchema,
    }),
  ),
});

export const updateAgentPolicyInputSchema = z.object({
  disclosureLevel: agentDisclosureLevelSchema.optional(),
  blockedTerms: z
    .array(z.string().trim().min(2).max(80))
    .max(50)
    .optional(),
});

export type AgentDisclosureLevel = z.infer<typeof agentDisclosureLevelSchema>;
export type AgentDisclosureLevelInfo = (typeof AGENT_DISCLOSURE_LEVELS)[number];
export type AgentPolicy = z.infer<typeof agentPolicySchema>;
export type UpdateAgentPolicyInput = z.input<
  typeof updateAgentPolicyInputSchema
>;
