import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { ListMyPostsUseCase } from "./list-my-posts.use-case.js";

describe("ListMyPostsUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let sut: ListMyPostsUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    sut = new ListMyPostsUseCase(postsRepository);
  });

  async function seedPost(userId: string, body: string, createdAt: Date) {
    const post = makePost({ userId, body, status: "published" });
    // Force a deterministic ordering by overriding the timestamp.
    (post as unknown as { createdAt: Date }).createdAt = createdAt;
    await postsRepository.create(post);
    return post;
  }

  it("returns both drafts and published posts for the owner", async () => {
    const published = makePost({
      userId: "user-1",
      body: "published",
      status: "published",
    });
    const draft = makePost({
      userId: "user-1",
      body: "draft",
      status: "draft",
    });
    await postsRepository.create(published);
    await postsRepository.create(draft);

    const result = await sut.execute({
      userId: "user-1",
      limit: 20,
      offset: 0,
    });

    expect(result).toHaveLength(2);
    expect(
      result.map((p) => p.status).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["draft", "published"]);
  });

  it("only returns posts belonging to the requested user", async () => {
    await seedPost("user-1", "mine", new Date("2024-01-01"));
    await seedPost("user-2", "theirs", new Date("2024-01-02"));

    const result = await sut.execute({
      userId: "user-1",
      limit: 20,
      offset: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.body).toBe("mine");
  });

  it("respects the limit (page size)", async () => {
    await seedPost("user-1", "a", new Date("2024-01-01"));
    await seedPost("user-1", "b", new Date("2024-01-02"));
    await seedPost("user-1", "c", new Date("2024-01-03"));

    const result = await sut.execute({ userId: "user-1", limit: 2, offset: 0 });

    expect(result).toHaveLength(2);
    // Sorted newest first: c, b
    expect(result.map((p) => p.body)).toEqual(["c", "b"]);
  });

  it("respects the offset (pagination window)", async () => {
    await seedPost("user-1", "a", new Date("2024-01-01"));
    await seedPost("user-1", "b", new Date("2024-01-02"));
    await seedPost("user-1", "c", new Date("2024-01-03"));

    const result = await sut.execute({ userId: "user-1", limit: 2, offset: 2 });

    // Newest first is c, b, a — offset 2 skips c, b leaving a.
    expect(result).toHaveLength(1);
    expect(result[0]?.body).toBe("a");
  });

  it("returns an empty list when the offset is past the end", async () => {
    await seedPost("user-1", "a", new Date("2024-01-01"));

    const result = await sut.execute({
      userId: "user-1",
      limit: 20,
      offset: 50,
    });

    expect(result).toEqual([]);
  });
});
