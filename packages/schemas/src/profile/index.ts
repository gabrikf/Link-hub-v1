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

/**
 * Where an image sits inside a frame it does not have the shape of.
 *
 * A FOCAL POINT, deliberately, and not a baked crop rectangle. The same banner
 * is painted into at least three different frames — 176px tall on the public
 * profile, 128px (96px above `@2xl`) in the compact preview, and a 3:1 tile in
 * the editor — and every one of them is `object-fit: cover`, i.e. every one of
 * them re-crops. A crop rectangle chosen at one aspect ratio is re-cropped by
 * the next frame and the face the owner centred slides back out of view, which
 * is the exact bug this feature exists to fix. A focal point survives that: it
 * says "keep THIS point of the photo at THIS point of the frame", and it holds
 * at any frame shape.
 *
 * - `x` / `y` — percentages, the CSS `object-position` pair. 50/50 is centred,
 *   which is what every browser already does, so an unset placement and a
 *   default placement render identically.
 * - `scale` — magnification on top of `cover`. 1 is untouched; the cap of 3
 *   is where a 1080p photo starts visibly falling apart on a retina banner.
 */
export const imagePlacementSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  scale: z.number().min(1).max(3),
});

/** A centred, unzoomed placement — what an image with no stored one renders as. */
export const CENTERED_IMAGE_PLACEMENT: ImagePlacement = {
  x: 50,
  y: 50,
  scale: 1,
};

/**
 * The veil painted over the background photo, as a percentage.
 *
 * 0 shows the photograph untouched, 100 hides it completely. The default is
 * NOT a neutral 50: it replaces a hardcoded `bg-zinc-100/82` /
 * `dark:bg-zinc-950/85` that made every background image people uploaded
 * essentially invisible — the bug reported as "I set a background and nothing
 * happened". 55 leaves the photo clearly readable as a photo while the profile
 * card, which turns to frosted glass whenever there IS a photo, stays
 * perfectly legible on top of it.
 */
export const DEFAULT_BACKGROUND_OVERLAY = 55;

/** Blur radius in CSS pixels applied to the background photo. */
export const DEFAULT_BACKGROUND_BLUR = 6;

/**
 * Everything about how the two decorative profile images are PLACED, as opposed
 * to which file they are (`bannerImageUrl` / `backgroundImageUrl` stay where
 * they are).
 *
 * One object rather than four sibling columns because these four values are
 * only ever read and written together, by one form, and a profile's appearance
 * is a single thing to a user. Every field carries a default, so a row written
 * before this feature existed parses into the exact behaviour it had.
 */
export const profileAppearanceSchema = z.object({
  bannerPlacement: imagePlacementSchema.nullable(),
  backgroundPlacement: imagePlacementSchema.nullable(),
  backgroundOverlay: z.number().min(0).max(100),
  backgroundBlur: z.number().min(0).max(24),
});

/**
 * The same four values, each with its own fallback — for READING a stored row
 * or a payload written by an older build.
 *
 * Two schemas rather than one, and the difference is load-bearing. A default on
 * the object as a whole only fires when the key is missing entirely, so the day
 * a fifth setting is added, every row already in the table fails the parse and
 * the owner loses the four settings they DID choose. Per-field defaults degrade
 * one field at a time.
 *
 * The write side deliberately does not get this leniency: the form always knows
 * all four values, so a partial appearance arriving over HTTP is a bug worth
 * hearing about rather than one worth filling in.
 */
export const storedProfileAppearanceSchema = z.object({
  bannerPlacement: imagePlacementSchema.nullable().default(null),
  backgroundPlacement: imagePlacementSchema.nullable().default(null),
  backgroundOverlay: z
    .number()
    .min(0)
    .max(100)
    .default(DEFAULT_BACKGROUND_OVERLAY),
  backgroundBlur: z.number().min(0).max(24).default(DEFAULT_BACKGROUND_BLUR),
});

export type ImagePlacement = z.infer<typeof imagePlacementSchema>;
export type ProfileAppearance = z.infer<typeof profileAppearanceSchema>;

/**
 * What an account that has never touched the appearance controls looks like.
 *
 * Spelled out rather than `.default({})`: zod 4 takes `.default()` in the
 * OUTPUT type, so an empty object is not a legal default for this schema even
 * though every field has one of its own.
 */
export const DEFAULT_PROFILE_APPEARANCE: ProfileAppearance = {
  bannerPlacement: null,
  backgroundPlacement: null,
  backgroundOverlay: DEFAULT_BACKGROUND_OVERLAY,
  backgroundBlur: DEFAULT_BACKGROUND_BLUR,
};

/**
 * Parse anything (a jsonb column, a legacy payload, `null`) into a usable
 * appearance. Never throws — an appearance is decoration, and a row somebody
 * hand-edited must not be able to take a profile page down.
 */
export function parseProfileAppearance(value: unknown): ProfileAppearance {
  const result = storedProfileAppearanceSchema.safeParse(value ?? {});
  return result.success ? result.data : DEFAULT_PROFILE_APPEARANCE;
}

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
  // Placement + background treatment. Defaulted rather than `.optional()` so a
  // consumer never has to ask whether the key was there — an account that has
  // never opened the appearance panel reads as the documented default.
  appearance: storedProfileAppearanceSchema.default(DEFAULT_PROFILE_APPEARANCE),
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

/**
 * "Is this handle free?" — asked while the user is still typing it.
 *
 * WHY IT EXISTS. `PUT /profile` answers 409 on a collision, which is a fine
 * answer and a terrible moment to receive it: the person has already filled in
 * the whole form, pressed Save and waited. The handle is also the one field on
 * that form whose value another account can silently own, and the one that is
 * a URL.
 *
 * `reason` rather than a bare boolean, because "somebody has it" and "nobody
 * may have it" are different problems with different fixes and the user is
 * entitled to know which one they hit. `null` when the name is free.
 *
 * NOT A RESERVATION. The answer is true at the moment it was computed and
 * nothing holds the name — two people typing the same handle both hear "free"
 * and the second `PUT /profile` still loses with a 409. That is deliberate:
 * holding names for anyone who types one is a denial-of-service with a nice UI.
 * The save remains the only decision, which is why the check reuses exactly the
 * predicate the save uses rather than a cleverer one of its own.
 */
export const usernameAvailabilityQuerySchema = z.object({
  // `.trim()` for the same reason `updateProfileSchemaInput.username` has it,
  // and it has to be the SAME rule: the check is only useful if it answers
  // about the handle the save would actually create.
  username: z.string().trim().min(1, "Username is required"),
});

export const usernameAvailabilitySchema = z.object({
  /** Echoed back, so a late answer to an abandoned keystroke is discardable. */
  username: z.string(),
  isAvailable: z.boolean(),
  reason: z.enum(["taken", "reserved"]).nullable(),
});

export const updateProfileSchemaInput = z.object({
  /**
   * The SAME rule `createUserSchemaInput.login` enforces, and it has to be:
   * a blocklist applied only at registration is a blocklist a user walks
   * around by signing up as `ana` and renaming to `dashboard` a minute later.
   */
  username: z
    .string()
    /*
     * TRIMMED BEFORE ANYTHING ELSE LOOKS AT IT, and it belongs here rather than
     * in the form: this is a URL, and " ada " is a login whose profile lives at
     * `/%20ada%20`. It is also what keeps the availability check honest — the
     * browser asks about the trimmed value, so a save that stored the untrimmed
     * one would answer "ada is available" and then create a different handle.
     * `.min(1)` runs after, so a whitespace-only username is rejected rather
     * than stored blank.
     */
    .trim()
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
  // Optional, and a WHOLE object when present: the appearance panel always
  // knows all four values, so a partial patch would only add a merge rule with
  // no caller. Absent means "leave the stored appearance alone".
  appearance: profileAppearanceSchema.optional(),
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
  appearance: storedProfileAppearanceSchema.default(DEFAULT_PROFILE_APPEARANCE),
  email: z.email(),
});

export type ProfileResponse = z.infer<typeof profileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchemaInput>;
export type UpdateProfileOutput = z.infer<typeof updateProfileSchemaOutput>;
export type UsernameAvailabilityQuery = z.infer<
  typeof usernameAvailabilityQuerySchema
>;
export type UsernameAvailability = z.infer<typeof usernameAvailabilitySchema>;
