import { z } from "zod/v4";

export const apiTokenScopeSchema = z.enum([
  "posts:read",
  "posts:write",
  // Lets an agent read the profile/resume/work history the disclosure policy
  // allows it to see. Read-only by design: agents never edit the resume.
  "profile:read",
  // Lets a Claude Code hook, a forge webhook relay or the local extractor CLI
  // append to the activity log. Write-only in practice: it grants ingestion,
  // never the ability to read back what was ingested.
  "activity:write",
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

/**
 * `CreateApiTokenUseCase` stores whatever scope array it is handed — it applies
 * no default of its own — so THIS default is the only one, and it silently
 * becomes the grant of every token created without an explicit `scopes` field
 * (the MCP setup flow, `POST /api-tokens` from a script).
 *
 * `activity:write` is deliberately NOT in it. The other three are what an agent
 * needs to do the job the user is asking for when they mint a token; activity
 * ingestion is a separate capability the user opts into by connecting a source,
 * and a token that can append to the activity log can also write plausible
 * fabricated history under someone's name. Widening the default would hand that
 * to every existing setup flow without anyone choosing it — the same silent
 * privilege creep the create-token dialog already guards against on the client.
 *
 * Existing tokens are unaffected either way: scopes are stored per token at
 * creation and `apiAccessGuard` only ever checks membership, so adding a value
 * to the enum can never revoke a scope a live token already carries.
 */
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
