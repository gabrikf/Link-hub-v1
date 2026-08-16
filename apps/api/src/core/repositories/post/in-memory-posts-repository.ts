import { PostEntity } from "../../entity/post/post-entity.js";
import {
  IPostRepository,
  PostListOptions,
} from "./post-repository.js";

export class InMemoryPostsRepository implements IPostRepository {
  private posts: PostEntity[] = [];

  async create(post: PostEntity): Promise<PostEntity> {
    this.posts.push(post);
    return post;
  }

  async findById(id: string): Promise<PostEntity | null> {
    const post = this.posts.find((candidate) => candidate.id === id);
    return post ?? null;
  }

  /** Mirrors the drizzle repository's `metadata->>'digestKey'` predicate. */
  async findByDigestKey(
    userId: string,
    digestKey: string,
  ): Promise<PostEntity | null> {
    const post = this.posts.find(
      (candidate) =>
        candidate.userId === userId &&
        candidate.metadata?.digestKey === digestKey,
    );

    return post ?? null;
  }

  async listByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]> {
    return this.posts
      .filter((candidate) => candidate.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(options.offset, options.offset + options.limit);
  }

  async listPublishedByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]> {
    return this.posts
      .filter(
        // Mirrors the drizzle repository's `status = 'published'` predicate:
        // an allowlist, so a new non-public status (`pending_review`) is
        // excluded by construction rather than by remembering to deny it.
        (candidate) =>
          candidate.userId === userId && candidate.status === "published",
      )
      .sort((a, b) => {
        const aTime = (a.publishedAt ?? a.createdAt).getTime();
        const bTime = (b.publishedAt ?? b.createdAt).getTime();
        return bTime - aTime;
      })
      .slice(options.offset, options.offset + options.limit);
  }

  async update(post: PostEntity): Promise<PostEntity> {
    const index = this.posts.findIndex((candidate) => candidate.id === post.id);

    if (index === -1) {
      throw new Error(`Post with id '${post.id}' not found`);
    }

    this.posts[index] = post;
    return post;
  }

  async delete(id: string): Promise<void> {
    this.posts = this.posts.filter((candidate) => candidate.id !== id);
  }

  getAll() {
    return [...this.posts];
  }

  clear() {
    this.posts = [];
  }
}
