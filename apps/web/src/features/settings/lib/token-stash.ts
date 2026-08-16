import type { CreateApiTokenOutput } from "@repo/schemas";

/**
 * Session-scoped recovery for the one-time plaintext PAT, shared by every
 * surface that can mint one (the settings-page dialog and the wizard's inline
 * token block). sessionStorage survives route changes and reloads within the
 * tab and dies with the tab — matching the one-time nature of the plaintext
 * token: recoverable while the user is still mid-setup, never persisted
 * beyond that.
 */
const STASHED_TOKEN_KEY = "linkhub:last-created-token";

export function readStashedToken(): CreateApiTokenOutput | null {
  try {
    const raw = window.sessionStorage.getItem(STASHED_TOKEN_KEY);
    return raw ? (JSON.parse(raw) as CreateApiTokenOutput) : null;
  } catch {
    return null;
  }
}

export function stashToken(token: CreateApiTokenOutput): void {
  try {
    window.sessionStorage.setItem(STASHED_TOKEN_KEY, JSON.stringify(token));
  } catch {
    // Private mode / quota. The in-memory copy still drives this session.
  }
}
