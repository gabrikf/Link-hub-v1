import type { GitConnection } from "@repo/schemas";
import { reportHandled } from "../../../lib/report-error";

/**
 * Session-scoped recovery for a just-created connection's one-time plaintext
 * webhook secret, shared by every surface that shows the setup block (the
 * connections panel and the auto-post wizard). The sibling of `token-stash.ts`,
 * and for the same reason.
 *
 * Survives route changes and reloads within the tab, and dies with the tab —
 * matching the one-time nature of the plaintext webhook secret itself. The
 * setup block is useless if dismissing a dialog destroys the only copy of the
 * secret, and the only recovery is creating a second connection and orphaning
 * the first.
 */
const STASHED_CONNECTION_KEY = "crafthub:last-created-connection";

/** Only what the setup block needs. Never merged into the cached read model. */
export type StashedConnection = {
  connectionId: string;
  provider: GitConnection["provider"];
  displayName: string;
  /** Plaintext, shown once. Null for providers with no signed webhooks. */
  webhookSecret: string | null;
};

export function readStashedConnection(): StashedConnection | null {
  try {
    const raw = window.sessionStorage.getItem(STASHED_CONNECTION_KEY);
    return raw ? (JSON.parse(raw) as StashedConnection) : null;
  } catch (error) {
    // Private mode / blocked storage / corrupt entry. Never include the value —
    // it carries a plaintext webhook secret.
    reportHandled(error, { action: "storage.read-stashed-connection" });
    return null;
  }
}

export function stashConnection(value: StashedConnection): void {
  try {
    window.sessionStorage.setItem(
      STASHED_CONNECTION_KEY,
      JSON.stringify(value),
    );
  } catch (error) {
    // Private mode / quota. The in-memory copy still drives this session.
    reportHandled(error, { action: "storage.stash-connection" });
  }
}

export function clearStashedConnection(): void {
  try {
    window.sessionStorage.removeItem(STASHED_CONNECTION_KEY);
  } catch (error) {
    // Nothing to do — the in-memory state is cleared either way.
    reportHandled(error, { action: "storage.clear-stashed-connection" });
  }
}
