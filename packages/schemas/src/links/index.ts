import { z } from "zod";

export const linkIconSchema = z.enum([
  "youtube",
  "instagram",
  "x-twitter",
  "linkedin",
  "github",
  "tiktok",
  "facebook",
  "discord",
  "twitch",
  "pinterest",
  "reddit",
  "snapchat",
  "telegram",
  "whatsapp",
  "spotify",
  "soundcloud",
  "medium",
  "behance",
  "dribbble",
  "website",
]);

export const linkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1),
  url: z.string().url(),
  icon: linkIconSchema.nullable(),
  isPublic: z.boolean(),
  order: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createLinkSchemaInput = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Invalid URL format"),
  icon: linkIconSchema.nullable().optional(),
  isPublic: z.boolean().default(true),
});

export const updateLinkSchemaInput = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Invalid URL format"),
  icon: linkIconSchema.nullable().optional(),
  isPublic: z.boolean(),
});

export const reorderLinksSchemaInput = z.object({
  linkIds: z.array(z.string()).min(1, "At least one link id is required"),
});

export const toggleLinkVisibilitySchemaInput = z.object({
  isPublic: z.boolean(),
});

export const operationSuccessSchema = z.object({
  success: z.boolean(),
});

export const linkParamsSchema = z.object({
  id: z.string(),
});

export type LinkResponse = z.infer<typeof linkSchema>;
export type LinkIcon = z.infer<typeof linkIconSchema>;
export type CreateLinkInput = z.infer<typeof createLinkSchemaInput>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchemaInput>;
export type ReorderLinksInput = z.infer<typeof reorderLinksSchemaInput>;
export type ToggleLinkVisibilityInput = z.infer<
  typeof toggleLinkVisibilitySchemaInput
>;
