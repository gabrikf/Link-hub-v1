import { normalizeMatchToken, termMatches } from "./term-matching.js";

/**
 * Splits free text into single words.
 *
 * `+`, `#` and `.` survive on purpose so "c++", "c#" and "node.js" stay whole.
 * Single characters are dropped — they are never a skill and they match
 * everything.
 */
/** Strips a leading and trailing run of `.` characters, index-based so there
 * is no unanchored-quantifier regex for a long run of dots to backtrack on. */
function stripSurroundingDots(token: string): string {
  let start = 0;
  let end = token.length;

  while (start < end && token[start] === ".") {
    start += 1;
  }
  while (end > start && token[end - 1] === ".") {
    end -= 1;
  }

  return token.slice(start, end);
}

export function tokenizeMatchText(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/g)
    .map((token) => stripSurroundingDots(token.trim()))
    .filter((token) => token.length >= 2);
}

/** Longest catalog entry we will try to spot in free text, in words. */
const MAX_PHRASE_WORDS = 4;

/**
 * Pulls the catalog entries that actually appear in `text`.
 *
 * Unigram tokenization alone made every multi-word entry in the vocabulary
 * structurally unreachable: "machine learning" and "tailwind css" can never be
 * produced by a splitter that breaks on whitespace, so a recruiter typing
 * "machine learning engineer" matched the catalog entry zero times and the
 * whole skills bucket was skipped. This scans word n-grams up to
 * {@link MAX_PHRASE_WORDS} as well, and uses the shared substring-aware term
 * comparison so "react" is found inside a "React Native" catalog entry too.
 *
 * Returns the catalog entries (original casing), not the matched text.
 */
export function extractKnownTerms(
  text: string,
  catalog: readonly string[],
): string[] {
  if (catalog.length === 0) {
    return [];
  }

  const words = tokenizeMatchText(text);
  if (words.length === 0) {
    return [];
  }

  // Every contiguous n-gram of the query, so a multi-word catalog entry has
  // something of the same shape to be compared against.
  const phrases = new Set<string>();
  for (let start = 0; start < words.length; start += 1) {
    for (
      let size = 1;
      size <= MAX_PHRASE_WORDS && start + size <= words.length;
      size += 1
    ) {
      phrases.add(words.slice(start, start + size).join(" "));
    }
  }

  const phraseList = [...phrases];
  const found: string[] = [];
  const seen = new Set<string>();

  for (const entry of catalog) {
    const normalized = normalizeMatchToken(entry);
    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    // The catalog entry is the "expected" side: a query phrase satisfies it the
    // same way a candidate's skill satisfies a requested skill.
    if (phraseList.some((phrase) => termMatches(normalized, phrase))) {
      seen.add(normalized);
      found.push(entry);
    }
  }

  return found;
}
