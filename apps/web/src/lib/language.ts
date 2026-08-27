import { reportHandled } from "./report-error";

/**
 * The three locales the product ships. Deliberately region-tagged: `pt-BR` is
 * not `pt-PT` and `es-ES` is not `es-419`, and pretending otherwise produces
 * translations that read as foreign to half the audience.
 */
export const SUPPORTED_LANGUAGES = ["en-US", "pt-BR", "es-ES"] as const;

export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** English is the source language — every string in the app started as one. */
export const DEFAULT_LANGUAGE: Language = "en-US";

const LANGUAGE_STORAGE_KEY = "linkhub-language";

/**
 * Primary subtag → shipped locale.
 *
 * A browser that reports plain `pt`, or `pt-PT`, or `es-419`, is a real user
 * who should get a translated app rather than the English fallback. i18next's
 * own `supportedLngs` check is an exact-match one, so this widening happens
 * here, before i18next ever sees the tag.
 */
const PRIMARY_SUBTAG_TO_LANGUAGE: Record<string, Language> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
};

const isLanguage = (value: string | null): value is Language =>
  SUPPORTED_LANGUAGES.includes(value as Language);

/**
 * Maps any BCP-47 tag onto a shipped locale, or `null` when nothing matches.
 * Case-insensitive, because `navigator.language` casing is not guaranteed.
 */
export const resolveLanguage = (tag: string | null | undefined) => {
  if (!tag) {
    return null;
  }

  const normalised = tag.trim().toLowerCase();
  const exact = SUPPORTED_LANGUAGES.find(
    (language) => language.toLowerCase() === normalised,
  );
  if (exact) {
    return exact;
  }

  const primarySubtag = normalised.split("-")[0] ?? "";
  return PRIMARY_SUBTAG_TO_LANGUAGE[primarySubtag] ?? null;
};

export const getStoredLanguage = (): Language | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(rawValue) ? rawValue : null;
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
