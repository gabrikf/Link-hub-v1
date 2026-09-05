import { and, desc, eq, sql } from "drizzle-orm";
import {
  PostEntity,
  type PostSource,
  type PostStatus,
} from "../../../../core/entity/post/post-entity.js";
import {
  IPostRepository,
  PostListOptions,
} from "../../../../core/repositories/post/post-repository.js";
import { db } from "../index.js";
import { posts } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

type PostRow = typeof posts.$inferSelect;

function toEntity(row: PostRow): PostEntity {
  return new PostEntity({
    id: row.id,
    userId: row.userId,
    source: row.source as PostSource,
    title: row.title,
    body: row.body,
    coverImageUrl: row.coverImageUrl,
    images: (row.images as string[] | null) ?? null,
    tags: (row.tags as string[] | null) ?? null,
    status: row.status as PostStatus,
    externalUrl: row.externalUrl,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    workExperienceId: row.workExperienceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  });
}

export class DrizzlePostsRepository implements IPostRepository {
  async create(post: PostEntity): Promise<PostEntity> {
    const insertedRows = await db
      .insert(posts)
      .values({
        id: post.id,
        userId: post.userId,
        source: post.source,
        title: post.title,
        body: post.body,
        coverImageUrl: post.coverImageUrl,
        images: post.images,
        tags: post.tags,
        status: post.status,
        externalUrl: post.externalUrl,
        metadata: post.metadata,
        workExperienceId: post.workExperienceId,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        publishedAt: post.publishedAt,
      })
      .returning();

    return toEntity(requireReturnedRow(insertedRows, "insert into posts"));
  }

  async findById(id: string): Promise<PostEntity | null> {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));

    if (!post) {
      return null;
    }

    return toEntity(post);
  }

  /**
   * Scoped by `userId` first so the query uses `posts_user_id_idx` and then
   * filters the (small) result on the jsonb key, rather than asking Postgres to
   * scan every post in the table for a `metadata` field with no index on it.
   */
  async findByDigestKey(
    userId: string,
    digestKey: string,
  ): Promise<PostEntity | null> {
    const [post] = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.userId, userId),
          sql`${posts.metadata} ->> 'digestKey' = ${digestKey}`,
        ),
      )
      .limit(1);

    if (!post) {
      return null;
    }

    return toEntity(post);
  }

  async listByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]> {
    const rows = await db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    return rows.map(toEntity);
  }

  async listPublishedByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]> {
    const rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.status, "published")))
      .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    return rows.map(toEntity);
  }

  async update(post: PostEntity): Promise<PostEntity> {
    const [updated] = await db
      .update(posts)
      .set({
        source: post.source,
        title: post.title,
        body: post.body,
        coverImageUrl: post.coverImageUrl,
        images: post.images,
        tags: post.tags,
        status: post.status,
        externalUrl: post.externalUrl,
        metadata: post.metadata,
        workExperienceId: post.workExperienceId,
        updatedAt: post.updatedAt,
        publishedAt: post.publishedAt,
      })
      .where(eq(posts.id, post.id))
      .returning();

    if (!updated) {
      throw new Error(`Post with id '${post.id}' not found`);
    }

    return toEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await db.delete(posts).where(eq(posts.id, id));
  }
}
