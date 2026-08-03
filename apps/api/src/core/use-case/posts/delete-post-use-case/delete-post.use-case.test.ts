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
import { DeletePostUseCase } from "./delete-post.use-case.js";

describe("DeletePostUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: DeletePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new DeletePostUseCase(postsRepository);
  });

  it("deletes the post for its owner", async () => {
    const post = makePost({
      userId: "owner",
      body: "to delete",
      status: "published",
    });
    await postsRepository.create(post);

    const result = await sut.execute("owner", post.id);

    expect(result).toEqual({ success: true });
    expect(await postsRepository.findById(post.id)).toBeNull();
  });

  it("throws ForbiddenError when a non-owner deletes and leaves the post intact", async () => {
    const post = makePost({
      userId: "owner",
      body: "protected",
      status: "published",
    });
    await postsRepository.create(post);

    await expect(sut.execute("intruder", post.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await postsRepository.findById(post.id)).not.toBeNull();
  });

  it("throws ResourceNotFoundError when the post is missing", async () => {
    await expect(sut.execute("owner", "missing")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});

describe("DeletePostUseCase — search freshness", () => {
  let postsRepository: InMemoryPostsRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: DeletePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();
    sut = new DeletePostUseCase(
      postsRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );
  });

  it("enqueues a re-embedding so search stops matching a deleted post", async () => {
    await resumesRepository.upsertByUserId("owner", { summary: "hi" });
    const post = makePost({ userId: "owner", body: "gone", status: "published" });
    await postsRepository.create(post);

    await sut.execute("owner", post.id);

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].userId).toBe("owner");
  });

  it("does not enqueue for a draft — it was never in the index", async () => {
    await resumesRepository.upsertByUserId("owner", { summary: "hi" });
    const draft = makePost({ userId: "owner", body: "draft", status: "draft" });
    await postsRepository.create(draft);

    await sut.execute("owner", draft.id);

    expect(queue.jobs).toHaveLength(0);
  });

  it("is a no-op for a user with no resume row", async () => {
    const post = makePost({ userId: "owner", body: "gone", status: "published" });
    await postsRepository.create(post);

    await expect(sut.execute("owner", post.id)).resolves.toEqual({
      success: true,
    });
    expect(queue.jobs).toHaveLength(0);
  });
});
