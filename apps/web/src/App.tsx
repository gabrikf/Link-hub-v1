import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "@tanstack/react-router";
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

  /*
   * The language and theme controls used to live HERE, in a
   * `fixed right-4 top-3 z-40` cluster that rendered on every route regardless
   * of auth state and floated above all page content. It cost the app two
   * hardcoded pixel guesses aimed at it from below — `pr-52 sm:pr-60` in
   * `TopBarNav` and `mt-3` on the public profile's sign-in pill — and it still
   * collided on the logged-out profile and crowded the header on a phone.
   *
   * Both controls now render inside `TopBarNav`, in flow, in the layout that
   * owns the row. `App` keeps the theme STATE (it is what `usePreferencesSync`
   * and `useSystemThemeFollow` are wired to) and passes it down one level; the
   * nav decides where it appears at each breakpoint.
   */
  return (
    <div className="relative min-h-screen bg-zinc-100 text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <TopBarNav theme={resolvedTheme} onToggleTheme={toggleTheme} />
      <Outlet />
    </div>
  );
}

export default App;
