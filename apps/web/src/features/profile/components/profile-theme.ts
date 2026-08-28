import type { CSSProperties } from "react";
import type { ProfileResponse } from "@repo/schemas";

/** Derived from the shared profile schema so they stay in sync with the API. */
export type ThemePreset = NonNullable<ProfileResponse["themePreset"]>;
export type Persona = NonNullable<ProfileResponse["persona"]>;

/**
 * Ordered theme presets shown as swatches in the dashboard and used as the
 * default accent on the public profile. Each `accent` mirrors the value the
 * matching `.profile-theme-*` class sets in index.css.
 */
export const THEME_PRESETS: ReadonlyArray<{
  value: ThemePreset;
  accent: string;
}> = [
  { value: "violet", accent: "#8b5cf6" },
  { value: "ocean", accent: "#0ea5e9" },
  { value: "sunset", accent: "#f97316" },
  { value: "forest", accent: "#16a34a" },
  { value: "mono", accent: "#52525b" },
];

export const DEFAULT_THEME_PRESET: ThemePreset = "violet";

/**
 * Persona values from `personaSchema`, in the order they are offered.
 *
 * The labels used to live here as an English `Record`. They moved into the
 * locale catalogue under `enum.persona.<value>` — leaf names are the wire
 * values on purpose, so a call site writes ``t(`enum.persona.${value}`)`` with
 * no lookup table, and this module stays free of user-visible text. It is
 * imported by both the public profile and the dashboard, which is exactly why
 * a hardcoded English label here would have leaked English into a translated
 * screen.
 */
export const PERSONA_VALUES: ReadonlyArray<Persona> = [
  "developer",
  "designer",
  "product-manager",
  "product-owner",
  "qa-engineer",
  "data",
  "devops",
  "other",
];

export function accentForPreset(preset: ThemePreset | null): string {
  const match = THEME_PRESETS.find((p) => p.value === preset);
  return match?.accent ?? THEME_PRESETS[0].accent;
}

type ProfileThemeInput = {
  themeAccent?: string | null;
  themePreset?: ThemePreset | null;
};

/**
 * Compute the className + inline style that establish the profile theme on a
 * root element. The named preset seeds `--profile-accent` via its class; an
 * explicit hex (when present) wins by overriding the variable inline. Both
 * cascade into the existing profile blocks — no block edits required.
 */
export function getProfileThemeProps(profile: ProfileThemeInput): {
  className: string;
  style: CSSProperties;
} {
  const preset = profile.themePreset ?? DEFAULT_THEME_PRESET;
  const style = profile.themeAccent
    ? ({ "--profile-accent": profile.themeAccent } as CSSProperties)
    : {};

  return {
    className: `profile-root profile-theme-${preset}`,
    style,
  };
}

/** Defense-in-depth: only ever feed http(s) URLs into image sinks. */
export function safeImageUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}
