import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { ApprovePostUseCase } from "./approve-post.use-case.js";

describe("ApprovePostUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: ApprovePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new ApprovePostUseCase(postsRepository);
  });

  async function seedPendingReview() {
    const post = makePost({
      userId: "owner",
      source: "commit",
      body: "written by software",
      status: "pending_review",
      publishedAt: null,
    });
    await postsRepository.create(post);
    return post;
  }

  it("publishes a post awaiting review and stamps publishedAt", async () => {
    const post = await seedPendingReview();

    const result = await sut.execute({ userId: "owner", postId: post.id });

    expect(result.status).toBe("published");
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it("publishes the text exactly as the software wrote it", async () => {
    const post = await seedPendingReview();

    const result = await sut.execute({ userId: "owner", postId: post.id });

    expect(result.body).toBe("written by software");
    expect(result.source).toBe("commit");
  });

  it("publishes a draft too — moving forward to published is always legal", async () => {
    const draft = makePost({
      userId: "owner",
      body: "draft",
      status: "draft",
      publishedAt: null,
    });
    await postsRepository.create(draft);

    const result = await sut.execute({ userId: "owner", postId: draft.id });

    expect(result.status).toBe("published");
  });

  it("is idempotent on an already-published post and keeps the original publishedAt", async () => {
    // A retried approve (lost response, double-clicked button) must not fail,
    // and must not silently re-date a post that has been public for months.
    const originalPublishedAt = new Date("2024-01-01");
    const post = makePost({
      userId: "owner",
      source: "commit",
      body: "already public",
      status: "published",
      publishedAt: originalPublishedAt,
    });
    await postsRepository.create(post);

    const result = await sut.execute({ userId: "owner", postId: post.id });

    expect(result.status).toBe("published");
    expect(result.publishedAt).toEqual(originalPublishedAt);
  });

  it("throws ForbiddenError when someone else tries to approve the post", async () => {
    const post = await seedPendingReview();

    await expect(
      sut.execute({ userId: "intruder", postId: post.id }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stored = await postsRepository.findById(post.id);
    expect(stored!.status).toBe("pending_review");
  });

  it("throws ResourceNotFoundError when the post is missing", async () => {
    await expect(
      sut.execute({ userId: "owner", postId: "missing" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  // BUG-20260822-agent-self-publish: approving is the human's act of consent to
  // machine-written text. A PAT is software, so it may not perform it — even
  // though the PAT belongs to the same user and holds `posts:write`.
  describe("only a real session may release a post from review", () => {
    it("throws ForbiddenError when a PAT approves a pending_review post", async () => {
      const post = await seedPendingReview();

      await expect(
        sut.execute({ userId: "owner", postId: post.id, authType: "pat" }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const stored = await postsRepository.findById(post.id);
      expect(stored!.status).toBe("pending_review");
    });

    it("still lets the owner's real session approve (authType 'jwt')", async () => {
      const post = await seedPendingReview();

      const result = await sut.execute({
        userId: "owner",
        postId: post.id,
        authType: "jwt",
      });

      expect(result.status).toBe("published");
    });

    it("still lets a PAT publish a draft — a draft was never awaiting consent", async () => {
      const draft = makePost({
        userId: "owner",
        source: "mcp",
        body: "draft",
        status: "draft",
        publishedAt: null,
      });
      await postsRepository.create(draft);

      const result = await sut.execute({
        userId: "owner",
        postId: draft.id,
        authType: "pat",
      });

      expect(result.status).toBe("published");
    });
  });
});

describe("ApprovePostUseCase — search freshness", () => {
  let postsRepository: InMemoryPostsRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: ApprovePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();
    sut = new ApprovePostUseCase(
      postsRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );
  });

  it("enqueues a re-embedding so the approved post reaches recruiter search", async () => {
    await resumesRepository.upsertByUserId("owner", { summary: "hi" });
    const post = makePost({
      userId: "owner",
      source: "mcp",
      body: "approved work",
      status: "pending_review",
    });
    await postsRepository.create(post);

    await sut.execute({ userId: "owner", postId: post.id });

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].userId).toBe("owner");
  });

  it("does not re-enqueue when the post was already published", async () => {
    await resumesRepository.upsertByUserId("owner", { summary: "hi" });
    const post = makePost({
      userId: "owner",
      body: "already public",
      status: "published",
      publishedAt: new Date("2024-01-01"),
    });
    await postsRepository.create(post);

    await sut.execute({ userId: "owner", postId: post.id });

    expect(queue.jobs).toHaveLength(0);
  });
});
