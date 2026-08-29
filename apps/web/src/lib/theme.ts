import {
  DEFAULT_THEME_PREFERENCE,
  themePreferenceSchema,
  type ThemePreference,
} from "@repo/schemas";
import { reportHandled } from "./report-error";

/**
 * What is actually painted. Distinct from `ThemePreference`, which may be
 * `"system"` — a stored intent that has to be resolved against the OS before
 * anything can be rendered.
 */
export type Theme = "light" | "dark";

export type { ThemePreference };

/**
 * Unchanged on purpose. `DESIGN.md` tells contributors to set `crafthub-theme`
 * and reload rather than forcing the `.dark` class, and the visual scenarios do
 * exactly that. The key now holds a *preference* (`light` / `dark` / `system`)
 * instead of only a resolved theme, and the two old values are still valid
 * preferences — so every previously stored value keeps working with no
 * migration and no reset for anyone mid-session.
 */
const THEME_STORAGE_KEY = "crafthub-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

const isThemePreference = (value: string | null): value is ThemePreference =>
  themePreferenceSchema.safeParse(value).success;

export const getSystemTheme = (): Theme => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
};

/** Resolves a stored intent into the theme to actually paint. */
export const resolveTheme = (preference: ThemePreference): Theme =>
  preference === "system" ? getSystemTheme() : preference;

export const getStoredThemePreference = (): ThemePreference | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(rawValue) ? rawValue : null;
  } catch (error) {
    // Private-mode / blocked storage. Following the system is a fine answer.
    reportHandled(error, { action: "theme.read-stored" });
    return null;
  }
};

/**
 * The preference to start from before anything has been fetched.
 *
 * Local storage is no longer the source of truth — the database is — but it is
 * still what seeds the FIRST PAINT, because a server value cannot arrive before
 * paint without an authenticated round-trip. Dropping this read to "do it
 * properly from the DB" would put a flash of the wrong theme on every load.
 */
export const getInitialThemePreference = (): ThemePreference =>
  getStoredThemePreference() ?? DEFAULT_THEME_PREFERENCE;

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  rootElement.classList.toggle("dark", theme === "dark");
  rootElement.style.colorScheme = theme;
};

/** Resolves a preference and paints it. */
export const applyThemePreference = (preference: ThemePreference): Theme => {
  const theme = resolveTheme(preference);
  applyTheme(theme);
  return theme;
};

export const persistThemePreference = (preference: ThemePreference) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch (error) {
    // No-op when storage is unavailable (private mode, quota).
    reportHandled(error, { action: "theme.persist" });
  }
};

export const initializeTheme = (): ThemePreference => {
  const preference = getInitialThemePreference();
  applyThemePreference(preference);
  return preference;
};

/**
 * Calls back when the OS flips between light and dark.
 *
 * `"system"` is a live preference, not a one-time reading: a user who never
 * touched the toggle and switches their laptop to dark mode at sunset expects
 * the app to follow without a reload. Without this listener `"system"` would
 * silently mean "whatever the OS was when the tab opened".
 *
 * Returns an unsubscribe function. `addEventListener` on a `MediaQueryList` is
 * guarded because Safari only gained it in 14 and throws on older versions,
 * where the whole feature degrading to "resolved at load" is acceptable.
 */
export const subscribeToSystemTheme = (
  onChange: (theme: Theme) => void,
): (() => void) => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const mediaQuery = window.matchMedia(DARK_QUERY);
  const listener = (event: MediaQueryListEvent) => {
    onChange(event.matches ? "dark" : "light");
  };

  if (typeof mediaQuery.addEventListener !== "function") {
    return () => {};
  }

  mediaQuery.addEventListener("change", listener);
  return () => mediaQuery.removeEventListener("change", listener);
};
