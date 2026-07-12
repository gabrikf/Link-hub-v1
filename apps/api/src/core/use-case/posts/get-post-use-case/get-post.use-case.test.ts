import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { GetPostUseCase } from "./get-post.use-case.js";

describe("GetPostUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: GetPostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new GetPostUseCase(postsRepository);
  });

  it("returns the post for its owner", async () => {
    const post = makePost({
      userId: "owner",
      body: "hello",
      status: "published",
    });
    await postsRepository.create(post);

    const result = await sut.execute("owner", post.id);

    expect(result.id).toBe(post.id);
    expect(result.body).toBe("hello");
  });

  it("throws ForbiddenError when a non-owner requests the post", async () => {
    const post = makePost({
      userId: "owner",
      body: "secret",
      status: "draft",
    });
    await postsRepository.create(post);

    await expect(sut.execute("intruder", post.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("throws ResourceNotFoundError when the post is missing", async () => {
    await expect(
      sut.execute("owner", "non-existent-id"),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
