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
  label: string;
  accent: string;
}> = [
  { value: "violet", label: "Violet", accent: "#8b5cf6" },
  { value: "ocean", label: "Ocean", accent: "#0ea5e9" },
  { value: "sunset", label: "Sunset", accent: "#f97316" },
  { value: "forest", label: "Forest", accent: "#16a34a" },
  { value: "mono", label: "Mono", accent: "#52525b" },
];

export const DEFAULT_THEME_PRESET: ThemePreset = "violet";

/** Human-readable labels for each persona value from `personaSchema`. */
export const PERSONA_LABELS: Record<Persona, string> = {
  developer: "Developer",
  designer: "Designer",
  "product-manager": "Product Manager",
  "product-owner": "Product Owner",
  "qa-engineer": "QA Engineer",
  data: "Data",
  devops: "DevOps",
  other: "Other",
};

export const PERSONA_OPTIONS: ReadonlyArray<{ value: Persona; label: string }> =
  (Object.keys(PERSONA_LABELS) as Persona[]).map((value) => ({
    value,
    label: PERSONA_LABELS[value],
  }));

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
