import {
  DEFAULT_UI_LANGUAGE,
  resolveUiLanguage,
  SUPPORTED_UI_LANGUAGES,
  type UiLanguage,
} from "@repo/schemas";
import { reportHandled } from "./report-error";

/**
 * The shipped locales and the tag-widening rules now live in `@repo/schemas`,
 * because they cross the API boundary in both directions: the preferences
 * endpoints validate against the same list, and the API resolves an inbound
 * `Accept-Language` header with the same widening. Two implementations of
 * "which locale does this tag mean" is how a user ends up with a Portuguese UI
 * and an English AI response.
 *
 * These re-exports keep every existing call site in `apps/web` unchanged.
 */
export const SUPPORTED_LANGUAGES = SUPPORTED_UI_LANGUAGES;

export type Language = UiLanguage;

/** English is the source language — every string in the app started as one. */
export const DEFAULT_LANGUAGE: Language = DEFAULT_UI_LANGUAGE;

const LANGUAGE_STORAGE_KEY = "crafthub-language";

export const resolveLanguage = resolveUiLanguage;

/**
 * The stored choice, or `null` for "follow the device".
 *
 * `null` is a real state rather than a missing one: it is what an account that
 * has never touched the switcher has, and it is what makes a fresh sign-in
 * start from the machine's own language.
 */
export const getStoredLanguage = (): Language | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return resolveLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch (error) {
    // Private-mode / blocked storage. The browser language is a fine answer.
    reportHandled(error, { action: "language.read-stored" });
    return null;
  }
};

/**
 * First entry of `navigator.languages` that maps onto a shipped locale. Walking
 * the whole list matters: a machine set to `["de-DE", "pt-BR", "en-US"]` should
 * get Portuguese, not English.
 */
export const getBrowserLanguage = (): Language => {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const candidates =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const candidate of candidates) {
    const resolved = resolveLanguage(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return DEFAULT_LANGUAGE;
};

/**
 * What to render before anything has been fetched.
 *
 * As with the theme, local storage seeds the first paint and the database is
 * authoritative once it answers. i18next initialises synchronously off this
 * value so the first frame already has the right catalogue.
 */
export const getInitialLanguage = (): Language =>
  getStoredLanguage() ?? getBrowserLanguage();

/**
 * Keeps `<html lang>` in step with the active language. `index.html` ships
 * `lang="en"`; leaving it stale is an accessibility defect, not a nicety —
 * screen readers take pronunciation from this attribute.
 */
export const applyLanguage = (language: Language) => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = language;
};

export const persistLanguage = (language: Language) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    // No-op when storage is unavailable (private mode, quota).
    reportHandled(error, { action: "language.persist" });
  }
};

/**
 * Drops the stored choice, returning the app to "follow the device".
 *
 * Used when the server says the account has no explicit language, so a stale
 * local value cannot outlive the preference it was mirroring.
 */
export const clearStoredLanguage = () => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  } catch (error) {
    reportHandled(error, { action: "language.clear-stored" });
  }
};
