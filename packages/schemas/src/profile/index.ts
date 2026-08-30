import { z } from "zod/v4";
import { linkSchema } from "../links/index.js";
import { fullLayoutSchema, httpUrlSchema } from "../profile-blocks/index.js";
import {
  isReservedUsername,
  RESERVED_USERNAME_MESSAGE,
} from "../reserved-usernames/index.js";

/** Hex color like "#7c3aed" (exactly 6 hex digits). */
const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6})$/, "Must be a hex color like #7c3aed");

/** Named theme presets available to profiles. */
export const themePresetSchema = z.enum([
  "violet",
  "ocean",
  "sunset",
  "forest",
  "mono",
]);

/** Profession / persona category (shared with the frontend). */
export const personaSchema = z.enum([
  "developer",
  "designer",
  "product-manager",
  "product-owner",
  "qa-engineer",
  "data",
  "devops",
  "other",
]);

/**
 * The user's own words for their role, used ONLY when `persona` is `"other"`.
 *
 * A SEPARATE field rather than widening `personaSchema` into a string: the
 * enum is what the profile is categorised by, and turning it into free text
 * would swap a caught contract break for a silent runtime one (every consumer
 * that switches on the eight known values would just stop matching). The enum
 * stays closed; this carries the label a physiotherapist needs.
 *
 * Trimmed and bounded at 60 like `createCatalogItemInputSchema.name` — the
 * enum labels are two or three words, and this renders inside a banner chip
 * that truncates. `.trim()` runs BEFORE `.min(1)`, so a whitespace-only string
 * is rejected rather than stored as a blank chip.
 */
export const personaOtherSchema = z.string().trim().min(1).max(60);

export const profileSchema = z.object({
  username: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  userPhoto: z.string().nullable(),
  backgroundImageUrl: z.string().nullable(),
  bannerImageUrl: z.string().nullable(),
  themeAccent: z.string().nullable(),
  themePreset: themePresetSchema.nullable(),
  openToWork: z.boolean(),
  location: z.string().nullable(),
  persona: personaSchema.nullable(),
  // The free-text label behind `persona: "other"`. `.default(null)` rather
  // than a bare `.nullable()`: responses produced before this field existed
  // (and every fixture written against the old shape) omit the key entirely,
  // and a legacy payload should read as "no custom label", not fail the parse.
  personaOther: z.string().nullable().default(null),
  links: z.array(linkSchema),
  // Per-viewport public layout (tabs + grid-placed, visible-only blocks; pinned
  // blocks resolved). Optional so the authenticated `/me` endpoint (same schema)
  // can omit it; `/profile/:username` always populates it. `undefined` = legacy
  // response → the client falls back to a default layout.
  layout: fullLayoutSchema.optional(),
});

export const updateProfileSchemaInput = z.object({
  /**
   * The SAME rule `createUserSchemaInput.login` enforces, and it has to be:
   * a blocklist applied only at registration is a blocklist a user walks
   * around by signing up as `ana` and renaming to `dashboard` a minute later.
   */
  username: z
    .string()
    .min(1, "Username is required")
    .refine((value) => !isReservedUsername(value), RESERVED_USERNAME_MESSAGE),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  // User-editable avatar. Maps to the DB `avatarUrl` (exposed as `userPhoto` on
  // the read side); when omitted the OAuth-provided avatar is kept.
  userPhoto: httpUrlSchema.nullable().optional(),
  backgroundImageUrl: httpUrlSchema.nullable().optional(),
  bannerImageUrl: httpUrlSchema.nullable().optional(),
  themeAccent: hexColorSchema.nullable().optional(),
  themePreset: themePresetSchema.nullable().optional(),
  openToWork: z.boolean().optional(),
  location: z.string().max(120).nullable().optional(),
  persona: personaSchema.nullable().optional(),
  // `null` clears the custom label. The "persona is `other`, so this must be
  // present" rule is NOT expressed here on purpose: this is a partial update,
  // so a request may legitimately carry `persona` without `personaOther` (or
  // the reverse), and a cross-field refinement would reject those. The form
  // enforces the pairing where it can say so in the user's language, and
  // `UpdateProfileUseCase` clears the label whenever persona leaves "other".
  personaOther: personaOtherSchema.nullable().optional(),
});

export const updateProfileSchemaOutput = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  userPhoto: z.string().nullable(),
  backgroundImageUrl: z.string().nullable(),
  bannerImageUrl: z.string().nullable(),
  themeAccent: z.string().nullable(),
  themePreset: themePresetSchema.nullable(),
  openToWork: z.boolean(),
  location: z.string().nullable(),
  persona: personaSchema.nullable(),
  personaOther: z.string().nullable(),
  email: z.string().email(),
});

export type ProfileResponse = z.infer<typeof profileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchemaInput>;
export type UpdateProfileOutput = z.infer<typeof updateProfileSchemaOutput>;
