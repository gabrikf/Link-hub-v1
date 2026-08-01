import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { CreatePostUseCase } from "./create-post.use-case.js";

describe("CreatePostUseCase", () => {
  let postsRepository: InMemoryPostsRepository;
  let usersRepository: InMemoryUsersRepository;
  let sut: CreatePostUseCase;

  beforeEach(() => {
    postsRepository = new InMemoryPostsRepository();
    usersRepository = new InMemoryUsersRepository();
    sut = new CreatePostUseCase(postsRepository, usersRepository);
  });

  it("should create a published manual post by default", async () => {
    const user = UserEntity.create({
      email: "author@example.com",
      login: "author",
      name: "Author",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const created = await sut.execute({
      userId: user.id,
      body: "# Hello world",
    });

    expect(created.body).toBe("# Hello world");
    expect(created.source).toBe("manual");
    expect(created.status).toBe("published");
    expect(created.publishedAt).toBeInstanceOf(Date);
  });

  it("should not stamp publishedAt for a draft post", async () => {
    const user = UserEntity.create({
      email: "author2@example.com",
      login: "author2",
      name: "Author 2",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const created = await sut.execute({
      userId: user.id,
      authType: "pat",
      source: "commit",
      body: "chore: bump deps",
      status: "draft",
    });

    expect(created.status).toBe("draft");
    expect(created.source).toBe("commit");
    expect(created.publishedAt).toBeNull();
  });

  it("should force source to manual for a JWT session even if it claims otherwise", async () => {
    const user = UserEntity.create({
      email: "author3@example.com",
      login: "author3",
      name: "Author 3",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const created = await sut.execute({
      userId: user.id,
      authType: "jwt",
      source: "commit",
      body: "totally a real commit",
    });

    expect(created.source).toBe("manual");
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({
        userId: "missing-user",
        body: "orphan post",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
