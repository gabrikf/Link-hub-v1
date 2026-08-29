/**
 * An email address identifies one mailbox however its owner capitalised it — a
 * phone keyboard capitalises the first letter by default, and Google hands the
 * same address back lowercased. Comparing the raw string let one mailbox become
 * two accounts: the sign-in lookup missed, the registration duplicate check
 * missed, and the OAuth lookup missed, so the profile the person had already
 * built simply appeared to be gone.
 *
 * Only the *comparison* is normalised. A stored address keeps the case its
 * owner typed: rewriting rows is a data migration, and addresses that already
 * collide are a decision for a human rather than a side effect of a login.
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase();
}
