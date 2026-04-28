import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { EnqueueResumeEmbeddingUseCase } from "../enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { UpsertMyResumeUseCase } from "./upsert-my-resume.use-case.js";

describe("UpsertMyResumeUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let resumesRepository: InMemoryResumesRepository;
  let resumeEmbeddingQueue: InMemoryResumeEmbeddingQueue;
  let sut: UpsertMyResumeUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    resumesRepository = new InMemoryResumesRepository();
    resumeEmbeddingQueue = new InMemoryResumeEmbeddingQueue();
    sut = new UpsertMyResumeUseCase(
      usersRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(resumeEmbeddingQueue),
    );
  });

  it("should create resume when user exists", async () => {
    const user = UserEntity.create({
      email: "resume@example.com",
      login: "resume-user",
      name: "Resume User",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const result = await sut.execute({
      userId: user.id,
      headlineTitle: "Fullstack Engineer",
      totalYearsExperience: 8,
      openToRelocation: true,
    });

    expect(result.userId).toBe(user.id);
    expect(result.headlineTitle).toBe("Fullstack Engineer");
    expect(result.totalYearsExperience).toBe(8);
    expect(result.openToRelocation).toBe(true);
    expect(resumesRepository.count()).toBe(1);
    expect(resumeEmbeddingQueue.jobs).toHaveLength(1);
  });

  it("should update existing resume for same user", async () => {
    const user = UserEntity.create({
      email: "resume2@example.com",
      login: "resume-user-2",
      name: "Resume User 2",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    await sut.execute({
      userId: user.id,
      headlineTitle: "Backend Engineer",
      totalYearsExperience: 4,
    });

    const updated = await sut.execute({
      userId: user.id,
      headlineTitle: "Senior Backend Engineer",
      totalYearsExperience: 6,
    });

    expect(updated.headlineTitle).toBe("Senior Backend Engineer");
    expect(updated.totalYearsExperience).toBe(6);
    expect(resumesRepository.count()).toBe(1);
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({
        userId: "missing-user",
        headlineTitle: "Ghost",
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
