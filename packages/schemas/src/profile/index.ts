import { z } from "zod/v4";
import { linkSchema } from "../links/index.js";
import { fullLayoutSchema, httpUrlSchema } from "../profile-blocks/index.js";

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
  links: z.array(linkSchema),
  // Per-viewport public layout (tabs + grid-placed, visible-only blocks; pinned
  // blocks resolved). Optional so the authenticated `/me` endpoint (same schema)
  // can omit it; `/profile/:username` always populates it. `undefined` = legacy
  // response → the client falls back to a default layout.
  layout: fullLayoutSchema.optional(),
});

export const updateProfileSchemaInput = z.object({
  username: z.string().min(1, "Username is required"),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  backgroundImageUrl: httpUrlSchema.nullable().optional(),
  bannerImageUrl: httpUrlSchema.nullable().optional(),
  themeAccent: hexColorSchema.nullable().optional(),
  themePreset: themePresetSchema.nullable().optional(),
  openToWork: z.boolean().optional(),
  location: z.string().max(120).nullable().optional(),
  persona: personaSchema.nullable().optional(),
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
  email: z.string().email(),
});

export type ProfileResponse = z.infer<typeof profileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchemaInput>;
export type UpdateProfileOutput = z.infer<typeof updateProfileSchemaOutput>;
