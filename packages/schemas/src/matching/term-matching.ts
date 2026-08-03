/**
 * The ONE definition of "how well does this candidate cover what was asked for".
 *
 * Before this module there were three: Jaccard in the training script, coverage
 * in the browser reranker, and a third coverage variant in the feature encoder.
 * The model was trained against Jaccard and then blended at runtime with a
 * coverage number, so the percentage a recruiter saw was an average of two
 * different questions. Everything now goes through `matchCoverage`.
 *
 * Two deliberate choices:
 *
 * 1. **Coverage, not Jaccard.** Jaccard divides by the union, so a candidate who
 *    knows React *and twenty other things* scores lower than a candidate who
 *    knows only React — for a recruiter who asked for React. That is the
 *    opposite of useful. Coverage answers the question actually printed on the
 *    card: "how much of what you asked for does this person have".
 *
 * 2. **Substring-aware.** The SQL mandatory filter matches with
 *    `lower(name) LIKE '%react%'`, so a candidate whose only skill is
 *    "React Native" *passes the hard filter*. The old exact-set comparison then
 *    scored that same candidate 0 on the 4x-weighted skills bucket and showed
 *    them as a "Weak match" — the search returned them precisely because they
 *    matched. Term matching here follows the SQL's containment direction (the
 *    candidate's term contains the requested term), so filter and score agree.
 */

/** Lowercases, trims and collapses internal whitespace. */
export function normalizeMatchToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Alphanumerics only. Lets "Node.js" and "nodejs" — the same skill typed two
 * ways by two different people — compare equal without a synonym table.
 */
function compactToken(value: string): string {
  return normalizeMatchToken(value).replace(/[^a-z0-9]/g, "");
}

function isBoundaryChar(char: string | undefined): boolean {
  return char === undefined || !/[a-z0-9]/.test(char);
}

/**
 * Does `actualTerm` (something the candidate has) satisfy `expectedTerm`
 * (something the search asked for)?
 *
 * Containment is checked at word boundaries rather than raw `includes`, which
 * is a little stricter than the SQL `LIKE '%…%'`: "React Native" satisfies
 * "react" (the case that matters), but "go" does not silently satisfy itself
 * inside "mongodb" or "django".
 *
 * The direction is asymmetric on purpose. Asking for "react" and finding
 * "React Native" is a match; asking for "React Native" and finding only "React"
 * is not — the same way the SQL filter behaves.
 */
export function termMatches(expectedTerm: string, actualTerm: string): boolean {
  const expected = normalizeMatchToken(expectedTerm);
  const actual = normalizeMatchToken(actualTerm);

  if (expected.length === 0 || actual.length === 0) {
    return false;
  }

  if (expected === actual) {
    return true;
  }

  const compactExpected = compactToken(expected);
  const compactActual = compactToken(actual);
  if (compactExpected.length > 0 && compactExpected === compactActual) {
    return true;
  }

  let index = actual.indexOf(expected);
  while (index !== -1) {
    const before = actual[index - 1];
    const after = actual[index + expected.length];
    if (isBoundaryChar(before) && isBoundaryChar(after)) {
      return true;
    }
    index = actual.indexOf(expected, index + 1);
  }

  return false;
}

/** The subset of `expected` that at least one `actual` term satisfies. */
export function matchedTerms(
  expected: readonly string[],
  actual: readonly string[],
): string[] {
  const normalizedExpected = uniqueNormalized(expected);
  const normalizedActual = uniqueNormalized(actual);

  return normalizedExpected.filter((expectedTerm) =>
    normalizedActual.some((actualTerm) => termMatches(expectedTerm, actualTerm)),
  );
}

function uniqueNormalized(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeMatchToken(value);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

/**
 * Fraction of the requested terms the candidate covers, in [0, 1].
 *
 * An empty request returns 1: nothing was asked for, so nothing is missing.
 * Callers that must not let an unconstrained field inflate a weighted average
 * should skip the bucket entirely rather than rely on this returning 0 — that
 * ambiguity is what made the three old implementations disagree at the edges.
 */
export function matchCoverage(
  expected: readonly string[],
  actual: readonly string[],
): number {
  const normalizedExpected = uniqueNormalized(expected);

  if (normalizedExpected.length === 0) {
    return 1;
  }

  return matchedTerms(normalizedExpected, actual).length / normalizedExpected.length;
}

/**
 * Identifies this metric in persisted metadata, so a model trained against a
 * different definition can be spotted instead of silently mis-scoring.
 */
export const MATCH_METRIC_ID = "coverage-substring-v1" as const;
