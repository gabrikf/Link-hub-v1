import type { QueryClient } from "@tanstack/react-query";
import type { UserPreferences } from "@repo/schemas";
import i18n from "../i18n";
import { fetchMyProfile, fetchPreferences } from "./auth-api";
import { getAuthTokens } from "./auth-tokens";
import {
  clearStoredLanguage,
  getBrowserLanguage,
  persistLanguage,
} from "./language";
import { PREFERENCES_QUERY_KEY } from "./query-client";
import { reportHandled } from "./report-error";
import {
  hasStoredSession,
  setSessionExpiredRedirect,
  signOut,
} from "./session";
import { applyThemePreference, persistThemePreference } from "./theme";
import { useUserInfoStore } from "./user-info-store";

/**
 * Boot: the one thing that happens before the first route paints.
 *
 * THE RULE THIS ENFORCES — "loading, then the correct page."
 *
 * The app used to decide who you were *after* painting. Every guard was a
 * post-paint `useEffect` inside a lazily-loaded page, so a signed-in person
 * hard-loading `/` watched the login form render and then vanish, and a
 * signed-out person hitting `/dashboard` was shown the dashboard shell before
 * being bounced. The URL was right within a frame or two; what was on screen
 * was a lie for that whole time.
 *
 * So the session and the preferences are resolved HERE, once, before
 * `RouterProvider` mounts. By the time any `beforeLoad` guard in `router.tsx`
 * runs, "is there a session" is a settled synchronous question, and the answer
 * decides which chunk is even fetched.
 *
 * WHY PREFERENCES BELONG IN THE SAME GATE
 *
 * The user asked for the same rule for their settings: on the first load on a
 * new device, the very first thing that should happen is deciding what to
 * render — from the database if it has an answer, otherwise from the OS theme
 * and the browser's language. Applying them here rather than from an effect is
 * also what fixes the "my theme only arrives when I touch a switch" bug; see
 * the header of `preferences-sync.ts` for that story.
 *
 * WHAT THIS IS NOT
 *
 * It is not a place to prefetch screens. One `/me` (which the dashboard would
 * ask for anyway, and which is handed straight to the cache) and one
 * `/preferences`, in parallel. Anything heavier turns "loading, then the
 * correct page" into "loading for a while".
 *
 * `bootApp` NEVER REJECTS. `BootGate` unwraps it with React 19's `use()`, so a
 * rejection would suspend into the error boundary and show a broken app to
 * someone whose only problem is a flaky network. Every failure below resolves
 * to a decision instead.
 */

/**
 * How long boot may hold the first paint before it gives up and renders the app
 * anyway.
 *
 * A FAILURE AND A HANG ARE NOT THE SAME THING, and only the first one was
 * handled. Every `catch` below turns a rejection into a decision, which is why
 * `bootApp` can promise never to reject — but a request that simply never
 * settles never reaches a `catch`. The axios client deliberately sets no global
 * `timeout` (the resume parse and the recruiter search legitimately run for
 * tens of seconds, and a client-wide deadline would abort them), so an upstream
 * that accepts the connection and then stops answering — a saturated origin, a
 * proxy holding the socket, a captive portal — used to leave `BootGate`
 * suspended forever. Measured: the app sat on the loading skeleton indefinitely
 * with no error state and no way out, on a device that was one screen away from
 * working.
 *
 * Eight seconds is chosen to be far longer than a slow-but-working round trip
 * (so the pre-paint decision is still the accurate one on bad mobile networks)
 * and far shorter than a person's patience with a blank screen. Exceeding it is
 * not treated as a signed-out verdict — see `bootApp`.
 */
const BOOT_DEADLINE_MS = 8_000;

export type BootOutcome = "anonymous" | "authenticated";

export type BootResult = {
  outcome: BootOutcome;
  /**
   * Whether the server actually answered with preferences. `false` means the
   * app is rendering the local mirror or the device defaults — which is a fine
   * answer, but not the same as a confirmed one.
   */
  hasServerPreferences: boolean;
};

/**
 * zustand's `persist` reads `localStorage` synchronously but publishes the
 * result on its own schedule — measured in this app, `userInfo` is still `null`
 * for the first few renders after a hard load. A guard that read the store
 * before that settled would sign a signed-in person out on every refresh, so
 * boot waits for it explicitly rather than hoping.
 *
 * `rehydrate()` rather than a subscription to `onFinishHydration`: it resolves
 * when hydration is done and is safe to call again, so there is no event to
 * miss. A missed event here would hang the gate forever, which is the worst
 * failure this file could have.
 */
const waitForUserInfoHydration = async (): Promise<void> => {
  if (useUserInfoStore.persist.hasHydrated()) {
    return;
  }

  await useUserInfoStore.persist.rehydrate();
};

/**
 * Paints and mirrors a set of server preferences.
 *
 * Deliberately different from the mid-session apply in `preferences-sync.ts` in
 * one respect: when the account has NO language of its own, this switches the
 * interface to the browser's language. Mid-session that would be hostile —
 * it would swap the words under someone who is reading them — but at boot
 * nothing has been read yet, and "no stored language means the language of your
 * machine" is exactly what was asked for. Without it, a mirror left by whoever
 * used this browser last would win over the device.
 */
const applyBootPreferences = async (
  preferences: UserPreferences,
): Promise<void> => {
  // `"system"` resolves against the OS here, so an account that never picked a
  // theme gets the device's.
  applyThemePreference(preferences.theme);
  persistThemePreference(preferences.theme);

  const language = preferences.language;

  if (language) {
    persistLanguage(language);
  } else {
    clearStoredLanguage();
  }

  const target = language ?? getBrowserLanguage();

  if (i18n.resolvedLanguage !== target) {
    await i18n.changeLanguage(target);
  }
};

/**
 * Confirms the stored credentials still work, and hands the profile it had to
 * fetch to the cache so the dashboard does not immediately ask for it again.
 *
 * A 401 is handled a layer down: `auth-api`'s interceptor tries the refresh
 * endpoint first and only calls `handleSessionExpired()` — which clears the
 * tokens — when that fails too. So "are the tokens gone?" is the honest test
 * for an unrecoverable session, and it is the reason this does not simply treat
 * any rejection as a sign-out: an API that is down, or a response that fails to
 * parse, is not evidence that the person is not signed in. Keeping them signed
 * in there is recoverable (every screen has its own error state); signing them
 * out is not.
 */
const resolveSession = async (queryClient: QueryClient): Promise<boolean> => {
  try {
    const profile = await fetchMyProfile();
    queryClient.setQueryData(["me"], profile);
    return true;
  } catch (error) {
    if (!getAuthTokens()) {
      return false;
    }

    reportHandled(error, { action: "boot.resolve-session" });
    return true;
  }
};

const resolvePreferences = async (
  queryClient: QueryClient,
): Promise<UserPreferences | null> => {
  try {
    const preferences = await queryClient.fetchQuery({
      queryKey: PREFERENCES_QUERY_KEY,
      queryFn: fetchPreferences,
      staleTime: Infinity,
      retry: false,
    });

    return preferences;
  } catch (error) {
    /*
     * Reported, not swallowed. The previous shape read this query's `error`
     * nowhere at all, so a preferences endpoint that had been 500ing for a week
     * looked exactly like an account with no preferences. It still must not
     * block the app — the local mirror is a perfectly good answer — but it is
     * now an answer somebody can find out about.
     */
    reportHandled(error, { action: "boot.resolve-preferences" });
    return null;
  }
};

/**
 * Resolves to `timedOut` if `work` has not settled within the deadline.
 *
 * The in-flight work is deliberately NOT aborted. `resolveSession` hands the
 * profile it fetched to the query cache, so a late answer still spares the
 * dashboard a second request; letting it land is strictly better than throwing
 * it away. The timer is cleared either way so a resolved boot cannot hold a
 * handle open for eight seconds in a test environment.
 */
const timedOut = Symbol("boot-deadline");

async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | typeof timedOut> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(() => resolve(timedOut), ms);
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function bootApp(queryClient: QueryClient): Promise<BootResult> {
  await waitForUserInfoHydration();

  if (!hasStoredSession()) {
    /*
     * Half a session — tokens with no `userInfo`, or the reverse — is not
     * recoverable (see `hasStoredSession`), and leaving the remaining half in
     * storage means every later `getAuthTokens()` check disagrees with every
     * later `userInfo` check. Drop it and be honestly anonymous.
     *
     * An anonymous boot makes NO authenticated request and touches neither the
     * theme nor the language: whatever a logged-out visitor chose locally on a
     * public profile is theirs to keep.
     */
    if (getAuthTokens() || useUserInfoStore.getState().userInfo) {
      signOut();
    }

    return { outcome: "anonymous", hasServerPreferences: false };
  }

  /*
   * Expiry during boot must not hard-navigate. `handleSessionExpired` falls
   * back to `window.location.assign("/")` when no redirect handler is
   * registered, and App only registers one once it has mounted — which, by
   * design, is after this finishes. A no-op handler for the duration turns that
   * reload into what it should be: boot notices the tokens are gone and renders
   * the login page itself, with the expiry notice still parked for it to show.
   */
  const releaseRedirect = setSessionExpiredRedirect(() => {});

  try {
    // In parallel: one round-trip of latency, not two. `/preferences` is
    // requested even while the session is still unproven because both requests
    // share the same 401-and-refresh path, so a dead session fails them
    // together rather than one after the other.
    const settled = await withDeadline(
      Promise.all([resolveSession(queryClient), resolvePreferences(queryClient)]),
      BOOT_DEADLINE_MS,
    );

    /*
     * The deadline passed with the network still silent.
     *
     * KEEP THE SESSION. The stored credentials are the only evidence available
     * and nothing has contradicted them — an upstream that never answered is
     * not a statement about who this person is. Signing them out here would be
     * the same bug this module exists to prevent, arrived at from the other
     * direction: it is unrecoverable (their tokens are gone), while rendering
     * the app is not, because every screen owns an error state and the nav
     * still works. Preferences fall back to the local mirror, which is what
     * `initializeTheme()` already painted.
     */
    if (settled === timedOut) {
      reportHandled(
        new Error(`boot did not settle within ${BOOT_DEADLINE_MS}ms`),
        { action: "boot.deadline" },
      );

      return { outcome: "authenticated", hasServerPreferences: false };
    }

    const [isSessionValid, preferences] = settled;

    if (!isSessionValid) {
      queryClient.removeQueries({ queryKey: PREFERENCES_QUERY_KEY });
      return { outcome: "anonymous", hasServerPreferences: false };
    }

    if (preferences) {
      await applyBootPreferences(preferences);
    }

    return {
      outcome: "authenticated",
      hasServerPreferences: preferences !== null,
    };
  } finally {
    releaseRedirect();
  }
}

/**
 * One boot per page load, shared by every caller.
 *
 * `main.tsx` starts it at module scope so the requests are in flight before
 * React has mounted anything, and `BootGate` awaits the same promise. Memoising
 * is what makes StrictMode's double-invoked effects — and any future second
 * consumer — cost nothing.
 */
let bootPromise: Promise<BootResult> | null = null;

export function startBoot(queryClient: QueryClient): Promise<BootResult> {
  bootPromise ??= bootApp(queryClient);
  return bootPromise;
}

/** Test seam — drops the memoised boot so each test starts from nothing. */
export function resetBootForTests(): void {
  bootPromise = null;
}
