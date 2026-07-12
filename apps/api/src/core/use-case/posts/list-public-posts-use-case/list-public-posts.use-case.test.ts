import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { ListPublicPostsUseCase } from "./list-public-posts.use-case.js";

describe("ListPublicPostsUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let postsRepository: InMemoryPostsRepository;
  let sut: ListPublicPostsUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    postsRepository = new InMemoryPostsRepository();
    sut = new ListPublicPostsUseCase(usersRepository, postsRepository);
  });

  async function seedUser(login: string) {
    const user = UserEntity.create({
      email: `${login}@example.com`,
      login,
      name: login,
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);
    return user;
  }

  it("returns ONLY published posts and excludes drafts", async () => {
    const user = await seedUser("author");

    await postsRepository.create(
      makePost({
        userId: user.id,
        body: "published post",
        status: "published",
        publishedAt: new Date("2024-02-01"),
      }),
    );
    await postsRepository.create(
      makePost({
        userId: user.id,
        body: "draft post",
        status: "draft",
      }),
    );

    const result = await sut.execute({
      username: "author",
      limit: 20,
      offset: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.body).toBe("published post");
    expect(result.every((p) => p.status === "published")).toBe(true);
  });

  it("does not leak another user's posts", async () => {
    const author = await seedUser("author");
    const other = await seedUser("other");

    await postsRepository.create(
      makePost({
        userId: author.id,
        body: "author published",
        status: "published",
        publishedAt: new Date("2024-02-01"),
      }),
    );
    await postsRepository.create(
      makePost({
        userId: other.id,
        body: "other published",
        status: "published",
        publishedAt: new Date("2024-02-02"),
      }),
    );

    const result = await sut.execute({
      username: "author",
      limit: 20,
      offset: 0,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.body).toBe("author published");
  });

  it("respects limit and offset over published posts", async () => {
    const user = await seedUser("author");

    for (let i = 1; i <= 3; i++) {
      await postsRepository.create(
        makePost({
          userId: user.id,
          body: `post-${i}`,
          status: "published",
          publishedAt: new Date(`2024-02-0${i}`),
        }),
      );
    }

    const page = await sut.execute({ username: "author", limit: 2, offset: 0 });
    expect(page).toHaveLength(2);
    // Newest published first.
    expect(page.map((p) => p.body)).toEqual(["post-3", "post-2"]);

    const nextPage = await sut.execute({
      username: "author",
      limit: 2,
      offset: 2,
    });
    expect(nextPage.map((p) => p.body)).toEqual(["post-1"]);
  });

  it("throws ResourceNotFoundError when the username does not exist", async () => {
    await expect(
      sut.execute({ username: "ghost", limit: 20, offset: 0 }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
