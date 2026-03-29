export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "linkhub-theme";

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark";

export const getSystemTheme = (): Theme => {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

export const getStoredTheme = (): Theme | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(rawValue) ? rawValue : null;
  } catch {
    return null;
  }
};

export const getInitialTheme = (): Theme =>
  getStoredTheme() ?? getSystemTheme();

export const applyTheme = (theme: Theme) => {
  if (typeof document === "undefined") {
    return;
  }

  const rootElement = document.documentElement;
  rootElement.classList.toggle("dark", theme === "dark");
  rootElement.style.colorScheme = theme;
};

export const persistTheme = (theme: Theme) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // No-op when storage is unavailable.
  }
};

export const initializeTheme = (): Theme => {
  const theme = getInitialTheme();
  applyTheme(theme);
  return theme;
};
