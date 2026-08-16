import { PostEntity } from "../../entity/post/post-entity.js";

export interface PostListOptions {
  limit: number;
  offset: number;
}

export interface IPostRepository {
  create(post: PostEntity): Promise<PostEntity>;
  findById(id: string): Promise<PostEntity | null>;
  /**
   * The post produced by one automatic digest run, looked up by the
   * `metadata.digestKey` the generator stamps on it.
   *
   * This is what makes the digest idempotent, and it lives in the database
   * rather than in the queue on purpose. A queue-level deduplication window
   * expires, and the moment it does a retried or re-swept job writes a second
   * post for a week that already has one — the same class of bug the resume
   * embedding queue documents at length. A row that already exists never
   * expires.
   */
  findByDigestKey(
    userId: string,
    digestKey: string,
  ): Promise<PostEntity | null>;
  listByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]>;
  listPublishedByUserId(
    userId: string,
    options: PostListOptions,
  ): Promise<PostEntity[]>;
  update(post: PostEntity): Promise<PostEntity>;
  delete(id: string): Promise<void>;
}
