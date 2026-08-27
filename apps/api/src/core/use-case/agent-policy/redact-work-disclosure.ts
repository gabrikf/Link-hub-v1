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
 * What may sit between two words of an employer name.
 *
 * A URL cannot carry a space, so an agent linking its work writes the employer
 * as a slug: `acme-corp`, `acme_corp`, `acme.corp`, `Acme%20Corp` — or glues
 * the words together as `acmecorp`. Those are the same disclosure as the prose
 * spelling, in an `<a href>` an anonymous reader can click.
 *
 * One `*` on a character class, plus `%20` as a flat alternative. Deliberately
 * NOT a quantified group: the text being matched is a URL the agent fully
 * controls, and a nested quantifier there is a backtracking hazard.
 */
const SEPARATOR_SPELLINGS = ["[\\s\\-_.+]*", "%20"];

/**
 * What may stand in for one gap between two words of an employer name.
 *
 * The gap the user actually typed comes first and is always allowed, so a name
 * whose own punctuation is not a slug separator ("CI&T") keeps matching exactly
 * as it did. The slug spellings are added beside it, never instead of it.
 */
function buildGapPattern(gap: string): string {
  const alternatives = [...SEPARATOR_SPELLINGS];

  if (!/^[\s\-_.+]*$/.test(gap)) alternatives.unshift(escapeRegExp(gap));

  return `(?:${alternatives.join("|")})`;
}

/**
 * The regex body for one term: its words, in order, each gap allowed to be
 * written the way the user typed it or the way a URL would spell it.
 *
 * Splitting on everything that is not a letter or digit is what makes
 * "Vale S.A." match `vale-s-a`: the name's own punctuation is flattened by a
 * slug exactly like the space is.
 *
 * A single-word term comes out byte-identical to the escaped literal, so
 * nothing changes for the "Nubank" case. A term with fewer than two words —
 * including one with no letters or digits at all — falls back to the literal
 * rather than producing an empty body, which would match everywhere.
 */
function buildTermBody(term: string): string {
  // Splitting on a capturing group keeps the gaps: ["CI", "&", "T"].
  const parts = term.split(/([^\p{L}\p{N}]+)/u);
  const words: string[] = [];
  const gaps: string[] = [];

  parts.forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 0) words.push(part);
    // Punctuation before the first word is not a gap between two words; the
    // boundary lookbehind already covers it.
    else if (words.length > 0) gaps.push(part);
  });

  if (words.length < 2) return escapeRegExp(term);

  // The split already guarantees the words are letters and digits; escaping
  // them anyway keeps the pattern correct if that character class ever changes.
  let body = escapeRegExp(words[0]);
  for (let index = 1; index < words.length; index++) {
    body += buildGapPattern(gaps[index - 1]) + escapeRegExp(words[index]);
  }

  return body;
}

/**
 * Word-boundary matching that also works for accented and non-ASCII names.
 *
 * `\b` is ASCII-only in JavaScript, so `\bNubank\b` fails to behave for
 * "Fábrica" and friends. Instead we assert that the character on each side is
 * not a letter or digit, using unicode property escapes. Lookbehind and
 * lookahead keep the match zero-width, so overlapping terms each get their own
 * chance to match.
 *
 * The underscore is deliberately NOT in these classes. It is already a slug
 * separator in `SEPARATOR_SPELLINGS`, and treating it as a word character here
 * cancelled that rule at the edges of the term: `nubank_core` published the
 * employer name straight to the anonymous feed while `nubank-core` was refused.
 * In a URL an underscore is punctuation between tokens; a digit is part of one,
 * which is why `sun4life` still does not match "sun".
 *
 * The boundaries are what keep the separator tolerance honest: "Acme Corp" hits
 * `acme-corp-internal` and `acmecorp.com`, but not `corporate-ledger` (the
 * first word is missing) or `acmecorporate` (the match would end mid-word).
 */
function buildTermPattern(term: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${buildTermBody(term)}(?![\\p{L}\\p{N}])`,
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
