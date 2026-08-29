import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ThemePreference,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@repo/schemas";
import i18n from "../i18n";
import { fetchPreferences, updatePreferences } from "./auth-api";
import {
  clearStoredLanguage,
  persistLanguage,
  type Language,
} from "./language";
import { reportHandled } from "./report-error";
import {
  applyTheme,
  applyThemePreference,
  persistThemePreference,
  subscribeToSystemTheme,
  type Theme,
} from "./theme";
import { PREFERENCES_QUERY_KEY } from "./query-client";
import { useUserInfoStore } from "./user-info-store";

/**
 * Cross-device preferences: the database is the source of truth, `localStorage`
 * is the pre-paint cache in front of it.
 *
 * WHY BOTH, AND WHY IN THIS ORDER
 *
 * Theme and language are read SYNCHRONOUSLY before the first paint — `main.tsx`
 * calls `initializeTheme()` and `i18n/index.ts` calls `getInitialLanguage()`
 * before React renders anything. A database value cannot be there in time; it
 * needs an authenticated round-trip. So local storage seeds the first frame,
 * the server corrects it when it answers, and every server value is mirrored
 * back into local storage so the NEXT load's pre-paint read is already right.
 *
 * DECISION CHANGED — a signed-in load now DOES wait for the server.
 *
 * This module used to argue the opposite: that "waiting for the server before
 * painting is a blank screen on every load", so one visible correction on a new
 * device was the least-bad option. Two things made that wrong in practice.
 *
 * 1. The correction was not reliably visible at all. It rode on
 *    `useEffect(..., [preferences])`, and on a second sign-in in the same tab
 *    the cached entry is still fresh (`staleTime: Infinity`) and identical by
 *    reference, so the effect never re-ran — the account silently inherited the
 *    previous one's theme and language until an unrelated toggle wrote a new
 *    object into the cache. That was the reported bug: "the theme only becomes
 *    mine when I click the switch."
 * 2. "Blank screen" was a false choice. `lib/app-boot.ts` resolves the session
 *    and the preferences BEFORE the router mounts and shows a designed loading
 *    state — the same `RoutePending` idiom every route already uses — instead
 *    of nothing.
 *
 * So the order is now: boot resolves and APPLIES the server values, and this
 * hook stays as the in-session channel — it keeps the cache and the rendered
 * theme in step after a save, and covers a sign-in that happens without a page
 * load. The local mirror still seeds the first frame, which is what keeps a
 * returning user's boot flash-free.
 *
 * Anonymous visitors never reach any of this: the query is disabled without a
 * session, so a logged-out person reading a public profile keeps the purely
 * local behaviour they have today, with no request and no 401.
 */
/*
 * Re-exported from the local binding rather than with `export { X } from "..."`.
 * The forwarding form creates no local binding, and this module reads the key
 * in three places — with both forms present the bundler drops the import as
 * redundant and the reads become `ReferenceError` at runtime, which `tsc`
 * cannot see. (It happened. The login page rendered from the error boundary.)
 */
export { PREFERENCES_QUERY_KEY };

type PreferencesSyncOptions = {
  /** The preference the app is currently rendering. */
  themePreference: ThemePreference;
  /** Called when the server's stored preference differs from the local one. */
  onThemePreferenceChange: (preference: ThemePreference) => void;
};

/**
 * Applies a set of server preferences to the running app and mirrors them into
 * local storage. Deliberately does not write back to the server — this is the
 * inbound direction only, and calling the API from here would loop.
 */
const applyServerPreferences = (
  preferences: UserPreferences,
  onThemePreferenceChange: (preference: ThemePreference) => void,
  currentThemePreference: ThemePreference,
) => {
  if (preferences.theme !== currentThemePreference) {
    onThemePreferenceChange(preferences.theme);
    applyThemePreference(preferences.theme);
  }
  // Mirrored even when unchanged: the stored value may be absent entirely on a
  // device that has never rendered this account.
  persistThemePreference(preferences.theme);

  if (preferences.language) {
    persistLanguage(preferences.language);
    if (i18n.resolvedLanguage !== preferences.language) {
      void i18n.changeLanguage(preferences.language);
    }
    return;
  }

  /*
   * The account is on "follow the device". Clear the mirror so a value left by
   * a previous account on this browser cannot outlive the preference it was
   * copied from — but do NOT re-render into the device language here. Doing so
   * would yank the interface out from under someone who is mid-sentence, and
   * the device language is already what a fresh load resolves to.
   */
  clearStoredLanguage();
};

/**
 * Fetches the signed-in user's preferences, applies them, and hands back a
 * `save` function for the toggles to call.
 *
 * Every failure path here degrades to the local-only behaviour that existed
 * before this feature. A preferences endpoint being down must never blank a
 * screen or block a render — it is a nicety, not a dependency.
 */
export function usePreferencesSync({
  themePreference,
  onThemePreferenceChange,
}: PreferencesSyncOptions) {
  const isAuthenticated = useUserInfoStore((state) => state.userInfo !== null);

  const preferencesQuery = useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    enabled: isAuthenticated,
    // A preference is not worth a retry storm; the local value is a fine answer.
    retry: false,
    staleTime: Infinity,
    queryFn: fetchPreferences,
  });

  const preferences = preferencesQuery.data;

  /*
   * Both of these are read by the effect below but must not re-trigger it.
   *
   * `themePreference` is read only to decide whether a change is needed, so
   * depending on it would re-run the effect as a result of its own update.
   * `onThemePreferenceChange` arrives as an inline arrow from the caller, so
   * depending on it would re-run the effect on every parent render.
   *
   * Refs rather than a dependency-list suppression: the lint rule is right that
   * those values are read, and silencing it would also hide the next, real
   * missing dependency somebody adds here.
   */
  const themePreferenceRef = useRef(themePreference);
  const onThemePreferenceChangeRef = useRef(onThemePreferenceChange);

  useEffect(() => {
    themePreferenceRef.current = themePreference;
    onThemePreferenceChangeRef.current = onThemePreferenceChange;
  });

  useEffect(() => {
    if (!preferences) {
      return;
    }

    applyServerPreferences(
      preferences,
      onThemePreferenceChangeRef.current,
      themePreferenceRef.current,
    );
  }, [preferences]);

  const savePreferences = useSavePreferences();

  return { preferences, savePreferences };
}

/**
 * The write half on its own, so a control that is not the one running the sync
 * can still persist a change.
 *
 * The language switcher and the theme switch are siblings — neither owns the
 * other — and having each mount the full `usePreferencesSync` would run the
 * apply-from-server effect twice against one shared cache entry. This hook is
 * the mutation and nothing else.
 */
export function useSavePreferences() {
  const queryClient = useQueryClient();
  const isAuthenticated = useUserInfoStore((state) => state.userInfo !== null);

  const saveMutation = useMutation({
    mutationFn: updatePreferences,
    onSuccess: (updated) => {
      // Keeps the cache in step so the apply effect does not fight the toggle.
      queryClient.setQueryData(PREFERENCES_QUERY_KEY, updated);
    },
    onError: (error) => {
      // The local change already applied and persisted; the server just did not
      // hear about it. Worth reporting, never worth interrupting the user.
      reportHandled(error, { action: "preferences.save" });
    },
  });

  /*
   * The signed-out guard lives here rather than inside the mutation: an
   * anonymous visitor toggling the theme on a public profile must produce NO
   * request at all, not a request that 401s and gets swallowed.
   */
  return (patch: UpdateUserPreferencesInput) => {
    if (!isAuthenticated) {
      return;
    }

    saveMutation.mutate(patch);
  };
}

/**
 * Keeps a `"system"` preference honest.
 *
 * `"system"` is a live preference, not a reading taken at boot: someone who has
 * never touched the toggle and flips their laptop to dark mode at sunset
 * expects the app to follow without a reload. Without this the value would
 * quietly mean "whatever the OS was when the tab opened".
 */
export function useSystemThemeFollow(
  themePreference: ThemePreference,
  onResolvedThemeChange: (theme: Theme) => void,
) {
  const onResolvedThemeChangeRef = useRef(onResolvedThemeChange);

  useEffect(() => {
    onResolvedThemeChangeRef.current = onResolvedThemeChange;
  });

  useEffect(() => {
    if (themePreference !== "system") {
      return;
    }

    // Re-resolve on mount too: the OS may have changed while the preference was
    // pinned to an explicit value, or between boot and this effect running.
    onResolvedThemeChangeRef.current(applyThemePreference("system"));

    return subscribeToSystemTheme((theme) => {
      applyTheme(theme);
      // The toggle's sun/moon icon reads the RESOLVED theme, so it has to move
      // with the OS too — otherwise "system" paints dark behind a sun icon.
      onResolvedThemeChangeRef.current(theme);
    });
  }, [themePreference]);
}

export type { Language, Theme, ThemePreference, UserPreferences };
