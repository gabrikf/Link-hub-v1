import i18n from "../i18n";
import { clearAuthTokens, getAuthTokens } from "./auth-tokens";
import { queryClient } from "./query-client";
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

/**
 * English fallback / test fixture only. `handleSessionExpired` below resolves
 * the message through `i18n.t(...)` at the moment it is parked, so the stored
 * notice is in whatever language was active when the session expired — this
 * constant is not read on that path, it exists so `session.test.ts` has a
 * literal to assert against (the default locale renders identically).
 */
export const SESSION_EXPIRED_MESSAGE =
  "Your session expired, please sign in again.";

const SESSION_EXPIRED_STORAGE_KEY = "crafthub.auth.session-expired";

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

/**
 * True when this browser holds a session the app can actually render.
 *
 * BOTH halves are required. The tokens authorise the requests; `userInfo` is
 * what the top bar, the guards and every "is this me?" check read, and nothing
 * can rebuild it — `GET /me` answers with a public `profileSchema`, which has
 * no `id`, no `email` and no `emailVerified`. So half a session is not a
 * session: it renders a dashboard with no navigation and no identity.
 *
 * Deliberately synchronous and re-read from storage on every call, because the
 * router's `beforeLoad` guards run outside React and must not see a snapshot
 * taken before the last sign-in or sign-out.
 */
export function hasStoredSession(): boolean {
  return Boolean(getAuthTokens() && useUserInfoStore.getState().userInfo);
}

/**
 * The single way out of a session — used by the Logout button, by expiry, and
 * by boot when it finds credentials it cannot make sense of.
 *
 * CLEARING THE WHOLE CACHE IS THE POINT, not housekeeping.
 *
 * This used to evict exactly one key, `["preferences"]`, because that is where
 * a specific reported bug was traced to: that query is cached with
 * `staleTime: Infinity`, so an entry left by the previous account is still
 * *fresh* for the next person — React Query serves it from cache, never
 * refetches, and because the object is identical by reference the effect that
 * applies preferences never re-runs. The new account kept the old account's
 * theme and language until some unrelated toggle happened to write a new
 * object into the cache.
 *
 * Every other entry has the same shape of problem and none of them were being
 * evicted. `["me"]`, the posts, the links and the layout are all
 * account-scoped and all painted from cache before their refetch resolves, so
 * two people sharing a laptop meant the second one's dashboard opened showing
 * the first one's name, posts and links. Naming keys one at a time is a list
 * that goes stale the next time somebody adds a query; "the cache belongs to
 * the session, and the session is over" does not.
 *
 * Mounted observers do re-request after this, which is correct: whatever is
 * still on screen must now render as the anonymous app rather than from a
 * stranger's data. Every caller navigates to `/` immediately afterwards.
 */
export function signOut(): void {
  clearAuthTokens();
  useUserInfoStore.getState().clearUserInfo();
  queryClient.clear();
}

export function handleSessionExpired(): void {
  signOut();

  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(
      SESSION_EXPIRED_STORAGE_KEY,
      i18n.t("errors.sessionExpired"),
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
