import { beforeEach, describe, expect, it } from "vitest";
import { makePost } from "../../../entity/post/post-test-factory.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryPostsRepository } from "../../../repositories/post/in-memory-posts-repository.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
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

describe("UpdatePostUseCase — disclosure policy + search freshness", () => {
  let postsRepository: InMemoryPostsRepository;
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: UpdatePostUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    postsRepository = new InMemoryPostsRepository();
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();

    sut = new UpdatePostUseCase(
      postsRepository,
      usersRepository,
      workExperienceRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );

    user = UserEntity.create({
      email: "author@example.com",
      login: "author",
      name: "Author",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);

    await workExperienceRepository.create(
      WorkExperienceEntity.create({
        userId: user.id,
        title: "Engineer",
        companyName: "Acme Corp",
        employmentType: null,
        workModel: null,
        locationCity: null,
        locationState: null,
        locationCountry: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        description: null,
        mainStack: [],
        disclosureLevel: null,
        displayOrder: 0,
      }),
    );
  });

  async function seedOwnPost(body = "clean body") {
    const post = makePost({
      userId: user.id,
      body,
      status: "published",
      publishedAt: new Date(),
    });
    await postsRepository.create(post);
    return post;
  }

  it("rejects an agent edit that introduces the employer name", async () => {
    const post = await seedOwnPost();

    await expect(
      sut.execute({
        userId: user.id,
        postId: post.id,
        authType: "pat",
        body: "Actually this was all at Acme Corp.",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("checks the POST-PATCH result, so a title-only edit can't smuggle a term past a clean body", async () => {
    const post = await seedOwnPost("A perfectly clean body.");

    await expect(
      sut.execute({
        userId: user.id,
        postId: post.id,
        authType: "pat",
        title: "My time at Acme Corp",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("catches an existing violation carried over from an untouched field", async () => {
    // Seeded directly (as a human post would be), then edited by an agent: the
    // body it did not touch is still part of what the agent is now publishing.
    const post = await seedOwnPost("Written by the human about Acme Corp.");

    await expect(
      sut.execute({
        userId: user.id,
        postId: post.id,
        authType: "pat",
        title: "New title",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("does not block the human editing their own post", async () => {
    const post = await seedOwnPost();

    const updated = await sut.execute({
      userId: user.id,
      postId: post.id,
      authType: "jwt",
      body: "I worked at Acme Corp and I'll say so.",
    });

    expect(updated.body).toContain("Acme Corp");
  });

  it("enqueues a re-embedding after updating a published post", async () => {
    await resumesRepository.upsertByUserId(user.id, { summary: "hi" });
    const post = await seedOwnPost();

    await sut.execute({ userId: user.id, postId: post.id, body: "edited" });

    expect(queue.jobs).toHaveLength(1);
  });

  it("does not enqueue when the post stays a draft", async () => {
    await resumesRepository.upsertByUserId(user.id, { summary: "hi" });
    const draft = makePost({ userId: user.id, body: "draft", status: "draft" });
    await postsRepository.create(draft);

    await sut.execute({ userId: user.id, postId: draft.id, body: "still draft" });

    expect(queue.jobs).toHaveLength(0);
  });

  it("persists workExperienceId on update", async () => {
    const post = await seedOwnPost();
    const [role] = await workExperienceRepository.findByUserId(user.id);

    const updated = await sut.execute({
      userId: user.id,
      postId: post.id,
      workExperienceId: role.id,
    });

    expect(updated.workExperienceId).toBe(role.id);
  });
});
