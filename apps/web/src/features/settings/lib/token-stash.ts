import type { CreateApiTokenOutput } from "@repo/schemas";
import { reportHandled } from "../../../lib/report-error";

/**
 * Session-scoped recovery for the one-time plaintext PAT, shared by every
 * surface that can mint one (the settings-page dialog and the wizard's inline
 * token block). sessionStorage survives route changes and reloads within the
 * tab and dies with the tab — matching the one-time nature of the plaintext
 * token: recoverable while the user is still mid-setup, never persisted
 * beyond that.
 */
const STASHED_TOKEN_KEY = "crafthub:last-created-token";

export function readStashedToken(): CreateApiTokenOutput | null {
  try {
    const raw = window.sessionStorage.getItem(STASHED_TOKEN_KEY);
    return raw ? (JSON.parse(raw) as CreateApiTokenOutput) : null;
  } catch (error) {
    // Private mode / blocked storage / corrupt entry — "no stashed token" is
    // the correct answer either way. Never include the value itself.
    reportHandled(error, { action: "storage.read-stashed-token" });
    return null;
  }
}

export function stashToken(token: CreateApiTokenOutput): void {
  try {
    window.sessionStorage.setItem(STASHED_TOKEN_KEY, JSON.stringify(token));
  } catch (error) {
    // Private mode / quota. The in-memory copy still drives this session.
    reportHandled(error, { action: "storage.stash-token" });
  }
}
