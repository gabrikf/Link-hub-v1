import type { ApiToken } from "@repo/schemas";

/**
 * Renders a masked hint of a token from its stored prefix — e.g.
 * `lh_pat_ab12c…`. The plaintext is never available after creation, so this is
 * the most we can ever show for an existing token.
 */
export function maskTokenPrefix(tokenPrefix: string): string {
  return `${tokenPrefix}…`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

export function formatDate(value: Date | null): string {
  if (!value) {
    return "—";
  }
  return dateFormatter.format(value);
}

export function formatLastUsed(value: Date | null): string {
  return value ? formatDate(value) : "Never used";
}

export type TokenStatus = "active" | "revoked" | "expired";

export function getTokenStatus(token: ApiToken): TokenStatus {
  if (token.revokedAt) {
    return "revoked";
  }
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) {
    return "expired";
  }
  return "active";
}
