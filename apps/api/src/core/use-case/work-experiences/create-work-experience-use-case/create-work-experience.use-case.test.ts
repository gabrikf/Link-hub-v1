import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { CreateWorkExperienceUseCase } from "./create-work-experience.use-case.js";

describe("CreateWorkExperienceUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: CreateWorkExperienceUseCase;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();

    sut = new CreateWorkExperienceUseCase(
      usersRepository,
      workExperienceRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );

    await usersRepository.create(
      UserEntity.create({
        email: "user@example.com",
        login: "user",
        name: "User",
        password: "hashed",
        description: null,
        avatarUrl: null,
        googleId: null,
      }),
    );
  });

  async function userId() {
    const user = await usersRepository.findByLogin("user");
    return user!.id;
  }

  it("enqueues a resume re-embedding when the user has a resume", async () => {
    const id = await userId();
    await resumesRepository.upsertByUserId(id, { headlineTitle: "Engineer" });

    await sut.execute({
      userId: id,
      title: "Senior Engineer",
      companyName: "Acme",
    });

    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.reason).toBe("work-experience-changed");
    expect(queue.jobs[0]?.userId).toBe(id);
  });

  it("does not enqueue when the user has no resume yet", async () => {
    const id = await userId();

    await sut.execute({
      userId: id,
      title: "Senior Engineer",
      companyName: "Acme",
    });

    expect(queue.jobs).toHaveLength(0);
    expect(workExperienceRepository.items).toHaveLength(1);
  });

  it("still persists the work experience even though embedding is best-effort", async () => {
    const id = await userId();
    await resumesRepository.upsertByUserId(id, { headlineTitle: "Engineer" });

    const created = await sut.execute({
      userId: id,
      title: "Staff Engineer",
      companyName: "Globex",
    });

    expect(created.title).toBe("Staff Engineer");
    expect(workExperienceRepository.items).toHaveLength(1);
  });
});
