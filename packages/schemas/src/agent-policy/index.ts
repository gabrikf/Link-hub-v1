import { z } from "zod/v4";

/**
 * How much an agent acting on the candidate's behalf (the MCP server, the
 * profile assistant) is allowed to reveal about where they worked.
 *
 * This is a privacy contract, not a UI preference: the same three levels drive
 * the settings screen copy and the redaction the MCP applies before any work
 * history leaves CraftHub. Levels are ordered from most to least restrictive.
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
 * Every bullet a disclosure level can allow or block, keyed by its WIRE VALUE.
 *
 * The key is the bullet's stable identity and the only half that crosses a
 * boundary. `apps/web` resolves it through `t("enum.disclosureBullet.<id>")`,
 * so renaming a key silently drops a line of a privacy contract off the
 * settings screen — treat these as append-only.
 *
 * The value is the ENGLISH instruction, and it stays English on purpose: the
 * MCP injects it into tool descriptions and prompts read by the host model, and
 * the user's UI locale says nothing about the language that model reasons in.
 * The web app must therefore never render these strings — see the note on
 * `AGENT_DISCLOSURE_LEVELS.allows` below.
 */
export const AGENT_DISCLOSURE_BULLETS = {
  "role-titles": "Role titles and seniority",
  "dates-and-duration": "Start and end dates, and how long each role lasted",
  "employment-and-work-model":
    "Employment type (full-time, contract, freelance) and work model (remote, hybrid, on-site)",
  "tech-stack": "Tech stack and tools used",
  "engineering-practices":
    "Engineering practices and strategies (TDD, trunk-based development, event-driven architecture, CI/CD, pair programming)",
  "generic-problem-domains":
    "Problem domains described generically (payments, logistics, healthcare scheduling)",
  "non-identifying-metrics":
    "Non-identifying outcome metrics (\"cut p95 latency 40%\", \"halved build time\")",
  "everything-at-summary": "Everything allowed at Summary level",
  "employer-name": "Employer name",
  "public-product-names": "Public product names",
  "public-repositories": "Public repository names and links",
  "anything-in-profile":
    "Anything present in the profile, work history and posts",
  "employer-and-client-names": "Employer and client names",
  "internal-codenames":
    "Internal repository, service, project and codenames",
  "ticket-ids": "Ticket and issue ids",
  "customer-names": "Customer names",
  "unreleased-products": "Unreleased product names",
  "internal-architecture":
    "Internal architecture specifics (topology, vendor contracts, infrastructure layout)",
  "headcount-and-revenue": "Headcount and revenue figures",
  "employer-identifying-metrics":
    "Any metric that identifies the employer (\"the only Brazilian bank processing 4M PIX/day\")",
} as const satisfies Record<string, string>;

export type AgentDisclosureBulletId = keyof typeof AGENT_DISCLOSURE_BULLETS;

/**
 * Which bullets belong to which level — the structure of the contract, in wire
 * values only. `detailed` deliberately repeats several of `summary`'s blocks
 * rather than referring to them: an agent reading one level must see the whole
 * list without resolving a cross-reference.
 */
const LEVEL_BULLETS = {
  summary: {
    allows: [
      "role-titles",
      "dates-and-duration",
      "employment-and-work-model",
      "tech-stack",
      "engineering-practices",
      "generic-problem-domains",
      "non-identifying-metrics",
    ],
    blocks: [
      "employer-and-client-names",
      "internal-codenames",
      "ticket-ids",
      "customer-names",
      "unreleased-products",
      "internal-architecture",
      "headcount-and-revenue",
      "employer-identifying-metrics",
    ],
  },
  detailed: {
    allows: [
      "everything-at-summary",
      "employer-name",
      "public-product-names",
      "public-repositories",
    ],
    blocks: [
      "internal-codenames",
      "ticket-ids",
      "customer-names",
      "unreleased-products",
      "internal-architecture",
      "headcount-and-revenue",
    ],
  },
  full: {
    allows: ["anything-in-profile"],
    blocks: [],
  },
} as const satisfies Record<
  z.infer<typeof agentDisclosureLevelSchema>,
  {
    allows: readonly AgentDisclosureBulletId[];
    blocks: readonly AgentDisclosureBulletId[];
  }
>;

const englishText = (
  ids: readonly AgentDisclosureBulletId[],
): readonly string[] => ids.map((id) => AGENT_DISCLOSURE_BULLETS[id]);

/**
 * The contract for each level.
 *
 * Two representations of the same list, and only one of them is authored:
 *
 * - `allowIds` / `blockIds` are the wire values. **This is what a UI renders**,
 *   through `t("enum.disclosureBullet.<id>")`, so a Brazilian user reads the
 *   policy in Portuguese.
 * - `allows` / `blocks` are those same ids resolved to English through
 *   `AGENT_DISCLOSURE_BULLETS`. They exist for the MCP, which writes them into
 *   tool descriptions and prompts an agent follows. Derived, never authored,
 *   so the two can never drift apart.
 *
 * `label` and `shortDescription` follow the same split: they are the English an
 * agent reads. The web resolves `enum.disclosureLevel.<value>` and
 * `enum.disclosureLevelDescription.<value>` instead.
 */
export const AGENT_DISCLOSURE_LEVELS = [
  {
    value: "summary",
    label: "Summary",
    shortDescription:
      "Share what you did and how you did it, never who you did it for.",
    allowIds: LEVEL_BULLETS.summary.allows,
    blockIds: LEVEL_BULLETS.summary.blocks,
    allows: englishText(LEVEL_BULLETS.summary.allows),
    blocks: englishText(LEVEL_BULLETS.summary.blocks),
  },
  {
    value: "detailed",
    label: "Detailed",
    shortDescription:
      "Everything in Summary, plus the companies and public work behind it.",
    allowIds: LEVEL_BULLETS.detailed.allows,
    blockIds: LEVEL_BULLETS.detailed.blocks,
    allows: englishText(LEVEL_BULLETS.detailed.allows),
    blocks: englishText(LEVEL_BULLETS.detailed.blocks),
  },
  {
    value: "full",
    label: "Full",
    shortDescription:
      "No CraftHub-side restriction — you decide what the agent may say.",
    allowIds: LEVEL_BULLETS.full.allows,
    blockIds: LEVEL_BULLETS.full.blocks,
    allows: englishText(LEVEL_BULLETS.full.allows),
    blocks: englishText(LEVEL_BULLETS.full.blocks),
  },
] as const satisfies ReadonlyArray<{
  value: z.infer<typeof agentDisclosureLevelSchema>;
  label: string;
  shortDescription: string;
  allowIds: readonly AgentDisclosureBulletId[];
  blockIds: readonly AgentDisclosureBulletId[];
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
