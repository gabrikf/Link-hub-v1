import { z } from "zod/v4";
import { httpUrlSchema } from "../profile-blocks/index.js";

export const postSourceSchema = z.enum(["manual", "mcp", "agent", "commit"]);

/**
 * `pending_review` is the "written by software, waiting for a human" state. It
 * is NOT public: it is excluded from the public profile feed and from the
 * recruiter-search embeddings exactly like a draft. The difference from
 * `draft` is intent — a draft is the author's own unfinished writing, while a
 * `pending_review` post is finished text that only the human approving it can
 * make public (see the approve endpoint).
 */
export const postStatusSchema = z.enum([
  "draft",
  "pending_review",
  "published",
]);

export const postSchema = z.object({
  id: z.string(),
  userId: z.string(),
  source: postSourceSchema,
  title: z.string().nullable(),
  body: z.string(),
  coverImageUrl: z.string().nullable(),
  images: z.array(z.string()).nullable(),
  tags: z.array(z.string()).nullable(),
  status: postStatusSchema,
  externalUrl: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  publishedAt: z.coerce.date().nullable(),
});

/**
 * Shallow, bounded metadata bag. Keys and values are capped so a caller (or a
 * compromised PAT) can't stuff unbounded blobs into the row. The MCP's commit
 * metadata (repo/commitCount/period) fits comfortably within these limits.
 */
const postMetadataSchema = z.record(
  z.string().max(60),
  z.union([z.string().max(500), z.number(), z.boolean()]),
);

export const createPostSchemaInput = z.object({
  source: postSourceSchema.default("manual"),
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1, "Body is required").max(20000),
  coverImageUrl: httpUrlSchema.nullable().optional(),
  images: z.array(httpUrlSchema).max(12).nullable().optional(),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .nullable()
    .optional(),
  status: postStatusSchema.default("published"),
  externalUrl: httpUrlSchema.nullable().optional(),
  metadata: postMetadataSchema.nullable().optional(),
});

/**
 * No `source`, on purpose — provenance is write-once.
 *
 * `source` says who AUTHORED a post, which cannot become true or false later.
 * Accepting it on a patch let a web session hand-write a post and then relabel
 * it `commit`/`agent`/`mcp`, forging the machine-authored badge the review flow
 * exists to make trustworthy. Zod strips unknown keys, so a client that still
 * sends `source` gets it ignored rather than an error — the right outcome for a
 * field no caller was ever supposed to control. It is set once, at creation, by
 * `createPostSchemaInput` + `CreatePostUseCase` (which forces `manual` for any
 * non-PAT caller).
 */
export const updatePostSchemaInput = z.object({
  title: z.string().max(200).nullable().optional(),
  body: z.string().min(1).max(20000).optional(),
  coverImageUrl: httpUrlSchema.nullable().optional(),
  images: z.array(httpUrlSchema).max(12).nullable().optional(),
  tags: z
    .array(z.string().trim().min(1).max(40))
    .max(20)
    .nullable()
    .optional(),
  status: postStatusSchema.optional(),
  externalUrl: httpUrlSchema.nullable().optional(),
  metadata: postMetadataSchema.nullable().optional(),
});

export const listPostsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const postParamsSchema = z.object({
  id: z.string().uuid(),
});

export type Post = z.infer<typeof postSchema>;
export type PostSource = z.infer<typeof postSourceSchema>;
export type PostStatus = z.infer<typeof postStatusSchema>;
export type CreatePostInput = z.infer<typeof createPostSchemaInput>;
export type UpdatePostInput = z.infer<typeof updatePostSchemaInput>;
export type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
