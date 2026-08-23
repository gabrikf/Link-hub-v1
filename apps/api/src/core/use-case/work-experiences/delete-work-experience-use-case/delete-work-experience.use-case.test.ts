import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import type {
  IResumeEmbeddingQueue,
  ResumeEmbeddingJobPayload,
} from "../../../providers/queue/resume-embedding-queue.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryWorkExperienceRepository } from "../../../repositories/work-experience/in-memory-work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { DeleteWorkExperienceUseCase } from "./delete-work-experience.use-case.js";

const OWNER_ID = "user-owner";
const ATTACKER_ID = "user-attacker";

function makeRole(
  overrides: Partial<Parameters<typeof WorkExperienceEntity.create>[0]> = {},
) {
  return WorkExperienceEntity.create({
    userId: OWNER_ID,
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
    ...overrides,
  });
}

class ExplodingResumeEmbeddingQueue implements IResumeEmbeddingQueue {
  public attempts: ResumeEmbeddingJobPayload[] = [];

  async enqueue(payload: ResumeEmbeddingJobPayload): Promise<void> {
    this.attempts.push(payload);
    throw new Error("redis is down");
  }
}

describe("DeleteWorkExperienceUseCase", () => {
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: DeleteWorkExperienceUseCase;

  beforeEach(() => {
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();

    sut = new DeleteWorkExperienceUseCase(
      workExperienceRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );
  });

  describe("ownership", () => {
    it("refuses to delete another user's role and keeps the row", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await expect(
        sut.execute({ userId: ATTACKER_ID, workExperienceId: role.id }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(workExperienceRepository.items).toHaveLength(1);
      expect(await workExperienceRepository.findById(role.id)).not.toBeNull();
    });

    it("answers a forbidden delete with 403 and the ownership message", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await expect(
        sut.execute({ userId: ATTACKER_ID, workExperienceId: role.id }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You can only delete your own work experiences",
      });
    });

    it("does not re-embed when the delete is refused", async () => {
      const role = await workExperienceRepository.create(makeRole());
      await resumesRepository.upsertByUserId(ATTACKER_ID, {
        headlineTitle: "Attacker",
      });

      await expect(
        sut.execute({ userId: ATTACKER_ID, workExperienceId: role.id }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(queue.jobs).toHaveLength(0);
    });
  });

  it("rejects a non-existent id with 404 and does not touch the queue", async () => {
    await resumesRepository.upsertByUserId(OWNER_ID, {
      headlineTitle: "Engineer",
    });

    await expect(
      sut.execute({ userId: OWNER_ID, workExperienceId: "missing-id" }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Work experience with identifier 'missing-id' not found",
    });
    await expect(
      sut.execute({ userId: OWNER_ID, workExperienceId: "missing-id" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);

    expect(queue.jobs).toHaveLength(0);
  });

  it("deletes only the target role and leaves the siblings alone", async () => {
    const first = await workExperienceRepository.create(makeRole());
    const second = await workExperienceRepository.create(
      makeRole({ displayOrder: 1, title: "Senior Engineer" }),
    );
    const other = await workExperienceRepository.create(
      makeRole({ userId: ATTACKER_ID }),
    );

    await sut.execute({ userId: OWNER_ID, workExperienceId: first.id });

    expect(await workExperienceRepository.findById(first.id)).toBeNull();
    expect(await workExperienceRepository.findById(second.id)).not.toBeNull();
    expect(await workExperienceRepository.findById(other.id)).not.toBeNull();
  });

  it("returns undefined — the delete reports nothing back", async () => {
    const role = await workExperienceRepository.create(makeRole());

    const result = await sut.execute({
      userId: OWNER_ID,
      workExperienceId: role.id,
    });

    expect(result).toBeUndefined();
  });

  describe("resume re-embedding", () => {
    it("re-embeds the owner's resume after the delete", async () => {
      const role = await workExperienceRepository.create(makeRole());
      await resumesRepository.upsertByUserId(OWNER_ID, {
        headlineTitle: "Engineer",
      });

      await sut.execute({ userId: OWNER_ID, workExperienceId: role.id });

      expect(queue.jobs).toHaveLength(1);
      expect(queue.jobs[0]?.userId).toBe(OWNER_ID);
      expect(queue.jobs[0]?.reason).toBe("work-experience-changed");
    });

    it("does not enqueue when the user has no resume", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await sut.execute({ userId: OWNER_ID, workExperienceId: role.id });

      expect(queue.jobs).toHaveLength(0);
      expect(workExperienceRepository.items).toHaveLength(0);
    });

    it("keeps the delete when the re-embed fails — the stale vector is the accepted cost", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const explodingQueue = new ExplodingResumeEmbeddingQueue();
      const sutWithBrokenQueue = new DeleteWorkExperienceUseCase(
        workExperienceRepository,
        resumesRepository,
        new EnqueueResumeEmbeddingUseCase(explodingQueue),
      );

      const role = await workExperienceRepository.create(makeRole());
      await resumesRepository.upsertByUserId(OWNER_ID, {
        headlineTitle: "Engineer",
      });

      await expect(
        sutWithBrokenQueue.execute({
          userId: OWNER_ID,
          workExperienceId: role.id,
        }),
      ).resolves.toBeUndefined();

      expect(await workExperienceRepository.findById(role.id)).toBeNull();
      expect(explodingQueue.attempts).toHaveLength(1);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("works with the optional resume dependencies omitted", async () => {
      const bareSut = new DeleteWorkExperienceUseCase(
        workExperienceRepository,
      );
      const role = await workExperienceRepository.create(makeRole());

      await bareSut.execute({ userId: OWNER_ID, workExperienceId: role.id });

      expect(workExperienceRepository.items).toHaveLength(0);
      expect(queue.jobs).toHaveLength(0);
    });
  });
});
