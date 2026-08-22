import {
  DEFAULT_AGENT_DISCLOSURE_LEVEL,
  type AgentDisclosureLevel,
} from "@repo/schemas";

/**
 * Pure redaction primitives for the agent disclosure policy.
 *
 * The whole reason this file exists is that "don't name the client" written in
 * a tool description is a suggestion an LLM can ignore. These functions are the
 * enforcement: the same denylist is applied when a PAT writes a post and when
 * work history is read back over the API, so the rule holds regardless of what
 * the model decided to do.
 *
 * Deliberately dependency-free and side-effect-free — no repositories, no
 * entities, no I/O — so the tricky parts (word boundaries, accents, regex
 * metacharacters in company names) can be tested exhaustively in isolation.
 */

/** Replaces a blocked employer/client mention rather than deleting it, so the sentence still parses. */
export const DISCLOSURE_PLACEHOLDER = "[employer]";

/**
 * Terms shorter than this are ignored. A one-character denylist entry ("X" as a
 * company name) would match a letter in almost every sentence and shred the
 * text without protecting anything.
 */
const MIN_TERM_LENGTH = 2;

/** One employer name paired with the level in force for ITS OWN role. */
export interface DisclosureCompany {
  name: string;
  level: AgentDisclosureLevel;
}

export interface BuildBlockedTermsInput {
  /** Every employer on the user's work history, each with its own level. */
  companies: readonly DisclosureCompany[];
  /** Extra terms the user typed into settings (client codenames, project names). */
  userBlockedTerms: readonly string[];
}

/**
 * The effective denylist.
 *
 * An employer is blocked when ITS OWN role is at `summary` — that IS the level.
 * At `detailed` and `full` that employer may be named, so it drops off the
 * list; `full` is "no LinkHub-side restriction", which still means the user's
 * explicit denylist is honoured, because they asked for it.
 *
 * The level is per employer and never a single scalar for the whole list.
 * Raising ONE role to `full` — an open-source stint, a client that already
 * announced the work — says "you may name THIS employer". It must not un-block
 * the employer the user deliberately left at `summary`, whichever role the text
 * being checked happens to be attributed to.
 */
export function buildBlockedTerms({
  companies,
  userBlockedTerms,
}: BuildBlockedTermsInput): string[] {
  const terms = [
    ...companies
      .filter((company) => company.level === "summary")
      .map((company) => company.name),
    ...userBlockedTerms,
  ];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of terms) {
    const term = typeof raw === "string" ? raw.trim() : "";
    if (term.length < MIN_TERM_LENGTH) continue;

    // Case-insensitive de-dup: "Acme" and "acme" are one rule, not two.
    const key = term.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(term);
  }

  return result;
}

/** Escapes every regex metacharacter so "C++ Corp" or "A.B." is matched literally. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word-boundary matching that also works for accented and non-ASCII names.
 *
 * `\b` is ASCII-only in JavaScript, so `\bNubank\b` fails to behave for
 * "Fábrica" and friends. Instead we assert that the character on each side is
 * not a letter/digit/underscore, using unicode property escapes. Lookbehind and
 * lookahead keep the match zero-width, so overlapping terms each get their own
 * chance to match.
 */
function buildTermPattern(term: string): RegExp {
  const escaped = escapeRegExp(term);
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`,
    "giu",
  );
}

/**
 * Returns the blocked terms that actually appear in `text`, in denylist order.
 *
 * Matching is case-insensitive and anchored on word boundaries: "Nubank" hits
 * inside "Worked at Nubank." but "sun" does not hit inside "sunset". Terms are
 * returned in their canonical (settings) spelling so the error message tells
 * the agent which rule it tripped, not which casing it happened to use.
 */
export function findDisclosureViolations(
  text: string | null | undefined,
  blockedTerms: readonly string[],
): string[] {
  if (!text) return [];

  const hits: string[] = [];

  for (const term of blockedTerms) {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) continue;
    if (buildTermPattern(trimmed).test(text)) {
      hits.push(trimmed);
    }
  }

  return hits;
}

/**
 * Replaces every blocked-term occurrence with a neutral placeholder.
 *
 * Used on the read side (`GET /me/work-context`), where silently handing back
 * redacted prose is better than refusing: the agent still learns what the user
 * did, just not who for.
 */
export function redactText(
  text: string | null | undefined,
  blockedTerms: readonly string[],
): string {
  if (!text) return "";

  let result = text;

  for (const term of blockedTerms) {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) continue;
    result = result.replace(buildTermPattern(trimmed), DISCLOSURE_PLACEHOLDER);
  }

  return result;
}

/**
 * Resolves the level that actually applies to one role: its own override when
 * set, otherwise the account default. Kept here so the write path (posts) and
 * the read path (work context) can never disagree about precedence.
 */
export function resolveEffectiveLevel(
  accountLevel: AgentDisclosureLevel | null | undefined,
  roleOverride?: AgentDisclosureLevel | null,
): AgentDisclosureLevel {
  return roleOverride ?? accountLevel ?? DEFAULT_AGENT_DISCLOSURE_LEVEL;
}

/** A role, as far as the denylist is concerned. */
export interface DisclosureRole {
  companyName: string;
  disclosureLevel?: AgentDisclosureLevel | null;
}

/**
 * Pairs every employer on the history with the level in force for its own role,
 * ready for `buildBlockedTerms`. Kept here so the write path (posts), the read
 * path (work context) and the digest path can never disagree about which
 * employer a given level actually speaks for.
 */
export function resolveDisclosureCompanies(
  accountLevel: AgentDisclosureLevel | null | undefined,
  roles: readonly DisclosureRole[],
): DisclosureCompany[] {
  return roles.map((role) => ({
    name: role.companyName,
    level: resolveEffectiveLevel(accountLevel, role.disclosureLevel),
  }));
}
