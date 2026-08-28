import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { FiMoon, FiSun } from "react-icons/fi";
import { setSessionExpiredRedirect } from "./lib/session";
import {
  usePreferencesSync,
  useSystemThemeFollow,
} from "./lib/preferences-sync";
import {
  applyThemePreference,
  getInitialThemePreference,
  persistThemePreference,
  resolveTheme,
  type Theme,
  type ThemePreference,
} from "./lib/theme";
import { LanguageToggle } from "./shared-components/language-toggle";
import { FOCUS_RING_PAGE } from "./shared-components/surface";
import { TopBarNav } from "./shared-components/top-bar-nav";

function App() {
  /*
   * Two pieces of state, not one, because they answer different questions.
   *
   * `themePreference` is what gets STORED — and it may be `"system"`, which is
   * not something that can be painted. `resolvedTheme` is what is actually on
   * screen, and it moves on its own when the preference is `"system"` and the
   * OS flips. Collapsing them would either lose the ability to store "follow
   * the OS" or leave the sun/moon icon out of step with the painted theme.
   */
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    getInitialThemePreference(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<Theme>(() =>
    resolveTheme(getInitialThemePreference()),
  );
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Pulls the signed-in user's stored preferences over the top of the local
  // ones, and gives the toggles a way to write back. A no-op when signed out.
  const { savePreferences } = usePreferencesSync({
    themePreference,
    onThemePreferenceChange: (preference) => {
      setThemePreference(preference);
      setResolvedTheme(resolveTheme(preference));
    },
  });

  useSystemThemeFollow(themePreference, setResolvedTheme);

  // The 401 interceptor clears the stores and calls whatever is registered
  // here, so an expired session routes client-side instead of hard-reloading.
  useEffect(
    () => setSessionExpiredRedirect(() => void navigate({ to: "/" })),
    [navigate],
  );

  /*
   * Stays a two-state control on purpose: the switch flips what is on screen
   * right now, which is the only thing a person is thinking about when they
   * reach for it. Choosing it pins an explicit preference and leaves
   * `"system"` behind — that is what picking a theme MEANS, and an account that
   * never touches this keeps following the OS.
   *
   * Local first, then the server. The paint must not wait on a round-trip, and
   * a failed save leaves the local choice standing rather than reverting under
   * the user.
   */
  const toggleTheme = () => {
    const nextTheme: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    setThemePreference(nextTheme);
    setResolvedTheme(nextTheme);
    applyThemePreference(nextTheme);
    persistThemePreference(nextTheme);
    savePreferences({ theme: nextTheme });
  };

  return (
    <div className="relative min-h-screen bg-zinc-100 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <TopBarNav />
      {/*
       * Top-right on every breakpoint. Below `sm` this used to be
       * `fixed bottom-4 left-1/2`, parking it on top of the last row of content
       * on every page — including the Save/Publish row of open dialogs. `z-40`
       * (not 50) keeps it under the Radix dialog overlay, so it can never
       * cover a dialog's own controls either. The nav reserves `pr-52` so it
       * never collides with the hamburger — the cluster is two controls wide
       * now that language sits beside theme.
       */}
      <div className="fixed right-4 top-3 z-40 flex items-center gap-2">
        <LanguageToggle />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t("nav.switchTheme", {
            mode: t(resolvedTheme === "dark" ? "nav.themeLight" : "nav.themeDark"),
          })}
          className={`relative inline-flex h-9 w-20 shrink-0 cursor-pointer items-center rounded-full border border-zinc-300 bg-white/95 px-1 shadow-lg backdrop-blur transition hover:shadow-xl dark:border-zinc-700 dark:bg-zinc-900/90 ${FOCUS_RING_PAGE}`}
        >
          <span className="pointer-events-none absolute left-3 text-amber-500 dark:text-zinc-500">
            <FiSun className="h-4 w-4" />
          </span>
          <span className="pointer-events-none absolute right-3 text-zinc-500 dark:text-indigo-300">
            <FiMoon className="h-4 w-4" />
          </span>
          <span
            className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-700 text-white transition-transform duration-200 dark:bg-violet-500 ${resolvedTheme === "dark" ? "translate-x-[2.75rem]" : "translate-x-0"}`}
          >
            {resolvedTheme === "dark" ? (
              <FiMoon className="h-4 w-4" />
            ) : (
              <FiSun className="h-4 w-4" />
            )}
          </span>
        </button>
      </div>
      <Outlet />
    </div>
  );
}

export default App;
