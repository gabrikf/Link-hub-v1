import { z } from "zod/v4";

export const apiTokenScopeSchema = z.enum([
  "posts:read",
  "posts:write",
  // Lets an agent read the profile/resume/work history the disclosure policy
  // allows it to see. Read-only by design: agents never edit the resume.
  "profile:read",
]);

export type ApiTokenScope = z.infer<typeof apiTokenScopeSchema>;

export const apiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  tokenPrefix: z.string(),
  scopes: z.array(apiTokenScopeSchema),
  expiresAt: z.coerce.date().nullable(),
  lastUsedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  revokedAt: z.coerce.date().nullable(),
});

export const createApiTokenSchemaInput = z.object({
  name: z.string().min(1, "Name is required"),
  scopes: z
    .array(apiTokenScopeSchema)
    .default(["posts:read", "posts:write", "profile:read"]),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const createApiTokenSchemaOutput = apiTokenSchema.extend({
  // The one-time plaintext token — returned ONLY at creation time, never again.
  token: z.string(),
});

export const apiTokenParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ApiToken = z.infer<typeof apiTokenSchema>;
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchemaInput>;
export type CreateApiTokenOutput = z.infer<typeof createApiTokenSchemaOutput>;
