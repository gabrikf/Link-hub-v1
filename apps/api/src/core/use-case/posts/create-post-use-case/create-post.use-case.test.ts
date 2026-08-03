import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { BadRequestError, ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
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

/**
 * The disclosure policy is the reason this use case knows about work history at
 * all: an agent that names the employer must be STOPPED, not politely asked.
 */
describe("CreatePostUseCase — disclosure policy enforcement", () => {
  let postsRepository: InMemoryPostsRepository;
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: CreatePostUseCase;
  let user: UserEntity;

  async function seedUser(
    overrides: {
      agentDisclosureLevel?: "summary" | "detailed" | "full";
      agentBlockedTerms?: string[];
    } = {},
  ) {
    const created = UserEntity.create({
      email: `author-${crypto.randomUUID()}@example.com`,
      login: `author-${crypto.randomUUID()}`,
      name: "Author",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
      ...overrides,
    });
    await usersRepository.create(created);
    return created;
  }

  async function seedRole(
    userId: string,
    companyName: string,
    disclosureLevel: "summary" | "detailed" | "full" | null = null,
  ) {
    return workExperienceRepository.create(
      WorkExperienceEntity.create({
        userId,
        title: "Engineer",
        companyName,
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
        disclosureLevel,
        displayOrder: 0,
      }),
    );
  }

  beforeEach(async () => {
    postsRepository = new InMemoryPostsRepository();
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();

    sut = new CreatePostUseCase(
      postsRepository,
      usersRepository,
      workExperienceRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );

    user = await seedUser();
  });

  it("rejects an agent post that names the employer at summary level", async () => {
    await seedRole(user.id, "Acme Corp");

    await expect(
      sut.execute({
        userId: user.id,
        authType: "pat",
        source: "mcp",
        body: "Shipped a new checkout flow at Acme Corp this week.",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("names the offending term and how to fix it, so the agent can retry", async () => {
    await seedRole(user.id, "Acme Corp");

    await expect(
      sut.execute({
        userId: user.id,
        authType: "pat",
        body: "Shipped checkout at Acme Corp.",
      }),
    ).rejects.toThrow(/"Acme Corp"/);

    await expect(
      sut.execute({
        userId: user.id,
        authType: "pat",
        body: "Shipped checkout at Acme Corp.",
      }),
    ).rejects.toThrow(/summary/);
  });

  it("scans the title and the tags too, not only the body", async () => {
    await seedRole(user.id, "Acme Corp");

    await expect(
      sut.execute({
        userId: user.id,
        authType: "pat",
        title: "A week at Acme Corp",
        body: "Nothing to see here.",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);

    await expect(
      sut.execute({
        userId: user.id,
        authType: "pat",
        body: "Nothing to see here.",
        tags: ["typescript", "Acme Corp"],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("allows the same post once the employer is not named", async () => {
    await seedRole(user.id, "Acme Corp");

    const created = await sut.execute({
      userId: user.id,
      authType: "pat",
      source: "mcp",
      body: "Shipped a new checkout flow. TypeScript, Fastify, PostgreSQL.",
    });

    expect(created.id).toBeDefined();
  });

  it("does NOT block a human writing about their own career", async () => {
    await seedRole(user.id, "Acme Corp");

    const created = await sut.execute({
      userId: user.id,
      authType: "jwt",
      body: "I spent three great years at Acme Corp.",
    });

    expect(created.body).toContain("Acme Corp");
  });

  it("lets an agent name the employer at detailed level", async () => {
    const detailedUser = await seedUser({ agentDisclosureLevel: "detailed" });
    await seedRole(detailedUser.id, "Acme Corp");

    const created = await sut.execute({
      userId: detailedUser.id,
      authType: "pat",
      body: "Shipped checkout at Acme Corp.",
    });

    expect(created.body).toContain("Acme Corp");
  });

  it("still blocks the user's own terms at full level", async () => {
    const fullUser = await seedUser({
      agentDisclosureLevel: "full",
      agentBlockedTerms: ["Project Falcon"],
    });
    await seedRole(fullUser.id, "Acme Corp");

    // The employer is fine at full level...
    await expect(
      sut.execute({
        userId: fullUser.id,
        authType: "pat",
        body: "Shipped checkout at Acme Corp.",
      }),
    ).resolves.toBeDefined();

    // ...but a term the user explicitly banned is not.
    await expect(
      sut.execute({
        userId: fullUser.id,
        authType: "pat",
        body: "Wrapped up Project Falcon.",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("applies the attributed role's override instead of the account default", async () => {
    const role = await seedRole(user.id, "Open Source Co", "detailed");

    const created = await sut.execute({
      userId: user.id,
      authType: "pat",
      body: "Shipped a release at Open Source Co.",
      workExperienceId: role.id,
    });

    expect(created.workExperienceId).toBe(role.id);
  });

  it("persists workExperienceId when the post is attributed to a role", async () => {
    const role = await seedRole(user.id, "Acme Corp");

    const created = await sut.execute({
      userId: user.id,
      body: "A post about that job.",
      workExperienceId: role.id,
    });

    expect(created.workExperienceId).toBe(role.id);
  });

  it("enqueues a resume re-embedding after publishing so the post is searchable", async () => {
    await resumesRepository.upsertByUserId(user.id, { summary: "hi" });

    await sut.execute({ userId: user.id, body: "Published work" });

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0].userId).toBe(user.id);
  });

  it("does not enqueue for a draft — a draft is not searchable yet", async () => {
    await resumesRepository.upsertByUserId(user.id, { summary: "hi" });

    await sut.execute({ userId: user.id, body: "Draft work", status: "draft" });

    expect(queue.jobs).toHaveLength(0);
  });

  it("is a no-op, not a crash, for a user who has no resume row", async () => {
    await expect(
      sut.execute({ userId: user.id, body: "Published work" }),
    ).resolves.toBeDefined();
    expect(queue.jobs).toHaveLength(0);
  });
});
