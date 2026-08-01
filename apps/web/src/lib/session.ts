import { clearAuthTokens } from "./auth-tokens";
import { useUserInfoStore } from "./user-info-store";

/**
 * Session expiry.
 *
 * Every page gates on `hasSession = Boolean(getAuthTokens() && userInfo)`,
 * which reads localStorage rather than token *validity*. Before this module
 * existed, once the access token expired nothing redirected: every query
 * rejected with a 401 that no one handled, and the dashboard rendered with a
 * blank name, an empty links list and "No resume yet" — indistinguishable from
 * a wiped account. The only recovery was guessing that Logout -> Login fixed it.
 *
 * `handleSessionExpired()` is the single funnel: it clears both stores, parks a
 * message for the sign-in page and hands off to whoever registered a redirect
 * (App.tsx, so the redirect is a client-side route rather than a full reload).
 */

export const SESSION_EXPIRED_MESSAGE =
  "Your session expired, please sign in again.";

const SESSION_EXPIRED_STORAGE_KEY = "linkhub.auth.session-expired";

type SessionExpiredHandler = () => void;

let redirectHandler: SessionExpiredHandler | null = null;

/**
 * Registered by the app shell so expiry can route client-side. Returns an
 * unsubscribe function. With no handler registered we fall back to a hard
 * navigation, so expiry is still recoverable outside a mounted React tree.
 */
export function setSessionExpiredRedirect(
  handler: SessionExpiredHandler,
): () => void {
  redirectHandler = handler;

  return () => {
    if (redirectHandler === handler) {
      redirectHandler = null;
    }
  };
}

/**
 * Read-and-clear the pending expiry notice. The sign-in page calls this on
 * mount to explain why the user landed back there. Single-shot by design — a
 * later manual visit to `/` must not resurface a stale message.
 */
export function consumeSessionExpiredMessage(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const message = window.sessionStorage.getItem(SESSION_EXPIRED_STORAGE_KEY);

  if (message) {
    window.sessionStorage.removeItem(SESSION_EXPIRED_STORAGE_KEY);
  }

  return message;
}

/** True while an expiry notice is queued, without consuming it. */
export function hasSessionExpiredMessage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.sessionStorage.getItem(SESSION_EXPIRED_STORAGE_KEY) !== null
  );
}

export function handleSessionExpired(): void {
  clearAuthTokens();
  useUserInfoStore.getState().clearUserInfo();

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(
      SESSION_EXPIRED_STORAGE_KEY,
      SESSION_EXPIRED_MESSAGE,
    );
  }

  if (redirectHandler) {
    redirectHandler();
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign("/");
  }
}

/** Test seam — drops any registered redirect. */
export function resetSessionExpiredRedirect(): void {
  redirectHandler = null;
}
