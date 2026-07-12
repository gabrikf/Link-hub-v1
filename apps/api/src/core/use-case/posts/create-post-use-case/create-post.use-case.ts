import {
  PostEntity,
  type PostSource,
  type PostStatus,
} from "../../../entity/post/post-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IPostRepository } from "../../../repositories/post/post-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface ICreatePostInput {
  userId: string;
  /**
   * How the caller authenticated. Web/JWT sessions may not spoof the post
   * `source` — only PAT callers (MCP, agents, commit hooks) may set a
   * non-manual source. Defaults to treating unknown auth as untrusted (manual).
   */
  authType?: "jwt" | "pat";
  source?: PostSource;
  title?: string | null;
  body: string;
  coverImageUrl?: string | null;
  images?: string[] | null;
  tags?: string[] | null;
  status?: PostStatus;
  externalUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export class CreatePostUseCase {
  constructor(
    private postsRepository: IPostRepository,
    private usersRepository: IUsersRepository,
  ) {}

  async execute(input: ICreatePostInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    // Only PAT callers may claim a non-manual source. A web/JWT session (or an
    // unknown auth type) is always forced to "manual" so it can't spoof
    // mcp/agent/commit provenance.
    const source =
      input.authType === "pat" ? input.source ?? "manual" : "manual";
    const status = input.status ?? "published";

    const post = PostEntity.create({
      userId: input.userId,
      source,
      title: input.title ?? null,
      body: input.body,
      coverImageUrl: input.coverImageUrl ?? null,
      images: input.images ?? null,
      tags: input.tags ?? null,
      status,
      externalUrl: input.externalUrl ?? null,
      metadata: input.metadata ?? null,
      publishedAt: status === "published" ? new Date() : null,
    });

    return this.postsRepository.create(post);
  }
}
