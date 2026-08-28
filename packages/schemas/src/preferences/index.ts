import { z } from "zod/v4";

/**
 * Per-user interface preferences: the language the app is rendered in and the
 * light/dark choice.
 *
 * WHY THIS IS ITS OWN MODULE, AND ITS OWN TABLE
 *
 * `profileSchema` is the response shape for BOTH `GET /me` and the fully public
 * `GET /profile/:username`, and it is fed straight from the `users` row. Had
 * `language` and `theme` been added to `users`, the natural next edit — putting
 * them beside `themePreset`, which already lives in that schema — would publish
 * a person's UI language and dark-mode setting to every anonymous visitor of
 * their profile.
 *
 * Keeping them in a separate module backed by a separate table makes that leak
 * require deliberate effort rather than being the path of least resistance.
 *
 * Note the deliberate asymmetry with `tabsEnabled`, which lives in
 * `../profile-blocks`'s `layoutSchema` — one per viewport — and IS public,
 * because the public renderer has to know whether to draw the tab strip.
 */

/**
 * The three locales the product ships. Deliberately region-tagged: `pt-BR` is
 * not `pt-PT` and `es-ES` is not `es-419`, and pretending otherwise produces
 * translations that read as foreign to half the audience.
 *
 * This list lives in `@repo/schemas` rather than in the web app because it now
 * crosses the boundary in two directions: the preferences endpoints validate
 * against it, and the API resolves an inbound `Accept-Language` header with it.
 */
export const uiLanguageSchema = z.enum(["en-US", "pt-BR", "es-ES"]);

export type UiLanguage = z.infer<typeof uiLanguageSchema>;

export const SUPPORTED_UI_LANGUAGES = uiLanguageSchema.options;

/** English is the source language — every string in the app started as one. */
export const DEFAULT_UI_LANGUAGE: UiLanguage = "en-US";

/**
 * `system` is a real stored state, not the absence of one.
 *
 * The rejected alternative was to detect the OS theme once and freeze it into
 * the row on first login. That reads as "saved" but strands a user who later
 * flips their OS to dark mode in permanent light, with no UI explaining why.
 */
export const themePreferenceSchema = z.enum(["light", "dark", "system"]);

export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/**
 * `language: null` means "follow the device", the mirror of `theme: "system"`.
 * An untouched account gets both, which is what makes a fresh sign-in start
 * from the machine's own settings rather than from an arbitrary default.
 */
export const userPreferencesSchema = z.object({
  language: uiLanguageSchema.nullable(),
  theme: themePreferenceSchema,
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;

/**
 * Partial update. Both fields optional so a theme toggle does not have to
 * restate the language, but neither is widened to `string` — an unknown locale
 * is a 400, never a silent coercion to the default. A preference that quietly
 * becomes something else is indistinguishable from a save that did not happen.
 */
export const updateUserPreferencesSchemaInput = z
  .object({
    language: uiLanguageSchema.nullable().optional(),
    theme: themePreferenceSchema.optional(),
  })
  .refine(
    (value) => value.language !== undefined || value.theme !== undefined,
    { message: "At least one preference must be provided" },
  );

export type UpdateUserPreferencesInput = z.infer<
  typeof updateUserPreferencesSchemaInput
>;

export const updateUserPreferencesSchemaOutput = userPreferencesSchema;

export type UpdateUserPreferencesOutput = z.infer<
  typeof updateUserPreferencesSchemaOutput
>;

/**
 * Primary subtag → shipped locale.
 *
 * A browser that reports plain `pt`, or `pt-PT`, or `es-419`, is a real user
 * who should get a translated app rather than the English fallback. i18next's
 * own `supportedLngs` check is an exact-match one, so this widening happens
 * here, before i18next — or the API's `Accept-Language` parser — ever sees the
 * tag.
 */
const PRIMARY_SUBTAG_TO_LANGUAGE: Record<string, UiLanguage> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
};

/**
 * Maps any BCP-47 tag onto a shipped locale, or `null` when nothing matches.
 * Case-insensitive, because neither `navigator.language` casing nor the casing
 * of an inbound HTTP header is guaranteed.
 */
export const resolveUiLanguage = (
  tag: string | null | undefined,
): UiLanguage | null => {
  if (!tag) {
    return null;
  }

  const normalised = tag.trim().toLowerCase();
  const exact = SUPPORTED_UI_LANGUAGES.find(
    (language) => language.toLowerCase() === normalised,
  );
  if (exact) {
    return exact;
  }

  const primarySubtag = normalised.split("-")[0] ?? "";
  return PRIMARY_SUBTAG_TO_LANGUAGE[primarySubtag] ?? null;
};

/**
 * First acceptable locale in an `Accept-Language` header, honouring q-values.
 *
 * Written here rather than in the API because the widening rules above are the
 * same ones the browser side applies; two implementations of "which locale does
 * this tag mean" is how a user ends up with a Portuguese UI and English email.
 *
 * Malformed input yields `null` rather than throwing — this runs on a request
 * path where a header a client controls must never be able to produce a 500.
 */
export const parseAcceptLanguage = (
  header: string | null | undefined,
): UiLanguage | null => {
  if (!header) {
    return null;
  }

  const candidates = header
    .split(",")
    .map((part) => {
      const [tag, ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      return {
        tag: (tag ?? "").trim(),
        // A malformed q= is treated as "no preference expressed", not as 0 —
        // dropping the tag entirely would silently discard the user's only
        // signal because of a stray character.
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((candidate) => candidate.tag.length > 0 && candidate.quality > 0)
    // Stable sort by descending q, so equal weights keep header order.
    .sort((left, right) => right.quality - left.quality);

  for (const candidate of candidates) {
    const resolved = resolveUiLanguage(candidate.tag);
    if (resolved) {
      return resolved;
    }
  }

  return null;
};
