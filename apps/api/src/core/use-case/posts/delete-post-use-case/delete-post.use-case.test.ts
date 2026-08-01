import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
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
