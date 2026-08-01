import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { UpdatePostUseCase } from "./update-post.use-case.js";

describe("UpdatePostUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: UpdatePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new UpdatePostUseCase(postsRepository);
  });

  async function seedPost(
    overrides: Partial<{
      userId: string;
      body: string;
      status: "draft" | "published";
      publishedAt: Date | null;
    }> = {},
  ) {
    const post = makePost({
      userId: overrides.userId ?? "owner",
      body: overrides.body ?? "original body",
      status: overrides.status ?? "draft",
      publishedAt: overrides.publishedAt ?? null,
    });
    await postsRepository.create(post);
    return post;
  }

  it("applies a partial update, leaving untouched fields intact", async () => {
    const post = await seedPost({ body: "original", status: "draft" });

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      title: "New Title",
    });

    expect(result.title).toBe("New Title");
    // Body was not part of the patch, so it is preserved.
    expect(result.body).toBe("original");
    expect(result.status).toBe("draft");
  });

  it("stamps publishedAt when transitioning draft -> published", async () => {
    const post = await seedPost({ status: "draft", publishedAt: null });
    expect(post.publishedAt).toBeNull();

    const result = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
    });

    expect(result.status).toBe("published");
    expect(result.publishedAt).toBeInstanceOf(Date);
  });

  it("does NOT re-stamp publishedAt on a subsequent update once published", async () => {
    const post = await seedPost({ status: "draft", publishedAt: null });

    const firstPublish = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
    });
    const originalPublishedAt = firstPublish.publishedAt;
    expect(originalPublishedAt).toBeInstanceOf(Date);

    const secondUpdate = await sut.execute({
      userId: "owner",
      postId: post.id,
      status: "published",
      body: "edited after publishing",
    });

    expect(secondUpdate.body).toBe("edited after publishing");
    expect(secondUpdate.publishedAt).toEqual(originalPublishedAt);
  });

  it("throws ForbiddenError when a non-owner updates the post", async () => {
    const post = await seedPost({ userId: "owner" });

    await expect(
      sut.execute({ userId: "intruder", postId: post.id, body: "hijacked" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws ResourceNotFoundError when the post is missing", async () => {
    await expect(
      sut.execute({ userId: "owner", postId: "missing", body: "x" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
