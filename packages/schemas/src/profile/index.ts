import { z } from "zod";
import { linkSchema } from "../links/index.js";

export const profileSchema = z.object({
  username: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  userPhoto: z.string().nullable(),
  links: z.array(linkSchema),
});

export const updateProfileSchemaInput = z.object({
  username: z.string().min(1, "Username is required"),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
});

export const updateProfileSchemaOutput = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  userPhoto: z.string().nullable(),
  email: z.string().email(),
});

export type ProfileResponse = z.infer<typeof profileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchemaInput>;
export type UpdateProfileOutput = z.infer<typeof updateProfileSchemaOutput>;
