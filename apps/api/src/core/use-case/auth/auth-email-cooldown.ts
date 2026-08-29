/**
 * Minimum gap between two of the same self-service auth email to one account.
 *
 * This is the mail-bomb guard that actually matters, and it is shared by
 * `/auth/resend-verification` and `/auth/forgot-password` because both take an
 * arbitrary email address from an unauthenticated caller and turn it into a
 * message delivered to a third party.
 *
 * A per-IP HTTP rate limit sits on top, but it is the weaker of the two: the
 * victim is identified by their EMAIL, and an attacker with a proxy pool
 * changes IPs freely while the address stays put. Enforced against the last row
 * in the relevant token table, which no amount of address-hopping changes.
 *
 * 60 seconds: long enough that the endpoint is useless as a weapon, short
 * enough that a real person whose first link did not arrive is not made to wait.
 */
export const AUTH_EMAIL_COOLDOWN_MS = 60 * 1000;
