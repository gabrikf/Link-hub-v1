import {
  PostEntity,
  type PostSource,
  type PostStatus,
} from "./post-entity.js";

export interface MakePostOverrides {
  userId: string;
  source?: PostSource;
  title?: string | null;
  body?: string;
  status?: PostStatus;
  publishedAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Test-only factory for {@link PostEntity}. `PostEntity.create` requires every
 * prop; this helper fills type-correct defaults so tests only specify what they
 * care about. Not used by production code.
 */
export function makePost(overrides: MakePostOverrides): PostEntity {
  return PostEntity.create({
    userId: overrides.userId,
    source: overrides.source ?? "manual",
    title: overrides.title ?? null,
    body: overrides.body ?? "body",
    coverImageUrl: null,
    images: null,
    tags: null,
    status: overrides.status ?? "published",
    externalUrl: null,
    metadata: overrides.metadata ?? null,
    publishedAt: overrides.publishedAt ?? null,
  });
}
