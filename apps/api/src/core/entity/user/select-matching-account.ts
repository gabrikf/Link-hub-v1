import { normalizeEmail } from "./normalize-email.js";

/**
 * A lookup by address is case-insensitive (`normalizeEmail`), so one typed
 * address can match more than one stored row: a mailbox that ended up on file
 * twice in two different cases. Answering with whichever row the store happened
 * to hand back first locked the other owner out of their own account — they
 * typed their own address and their own password and the password of the *other*
 * row was the one that got checked.
 *
 * So the choice is made here, once, above both repositories: the row whose
 * address was stored exactly as the person typed it wins. That is the row they
 * registered, so everyone reaches their own account. When nothing matches
 * byte-for-byte the case-insensitive match still answers, which is what keeps a
 * lone capitalised row reachable from a lowercase address.
 *
 * Callers pass rows they have already matched — by address, and for the
 * email-or-login lookup by handle too — in a stable order, and get back the one
 * that answers.
 */
export function selectMatchingAccount<
  T extends { email: string; login: string },
>(candidates: readonly T[], typed: string): T | null {
  if (candidates.length <= 1) return candidates[0] ?? null;

  const typedExactly = candidates.find(
    (candidate) => candidate.email === typed,
  );
  if (typedExactly) return typedExactly;

  const byHandle = candidates.find((candidate) => candidate.login === typed);
  if (byHandle) return byHandle;

  const normalized = normalizeEmail(typed);
  const byAddress = candidates.find(
    (candidate) => normalizeEmail(candidate.email) === normalized,
  );

  return byAddress ?? candidates[0] ?? null;
}
