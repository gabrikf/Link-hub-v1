import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { UpdateWorkExperienceUseCase } from "./update-work-experience.use-case.js";

const OWNER_ID = "user-owner";
const ATTACKER_ID = "user-attacker";

function makeRole(
  overrides: Partial<Parameters<typeof WorkExperienceEntity.create>[0]> = {},
) {
  return WorkExperienceEntity.create({
    userId: OWNER_ID,
    title: "Engineer",
    companyName: "Acme Corp",
    employmentType: "full-time",
    workModel: "remote",
    locationCity: "Berlin",
    locationState: "BE",
    locationCountry: "DE",
    startDate: "2020-01-01",
    endDate: "2022-01-01",
    isCurrent: false,
    description: "Built things",
    mainStack: ["typescript"],
    disclosureLevel: null,
    displayOrder: 0,
    ...overrides,
  });
}

/** A queue that always fails, to characterize the best-effort re-embed path. */
class ExplodingResumeEmbeddingQueue implements IResumeEmbeddingQueue {
  public attempts: ResumeEmbeddingJobPayload[] = [];

  async enqueue(payload: ResumeEmbeddingJobPayload): Promise<void> {
    this.attempts.push(payload);
    throw new Error("redis is down");
  }
}

describe("UpdateWorkExperienceUseCase", () => {
  let workExperienceRepository: InMemoryWorkExperienceRepository;
  let resumesRepository: InMemoryResumesRepository;
  let queue: InMemoryResumeEmbeddingQueue;
  let sut: UpdateWorkExperienceUseCase;

  beforeEach(() => {
    workExperienceRepository = new InMemoryWorkExperienceRepository();
    resumesRepository = new InMemoryResumesRepository();
    queue = new InMemoryResumeEmbeddingQueue();

    sut = new UpdateWorkExperienceUseCase(
      workExperienceRepository,
      resumesRepository,
      new EnqueueResumeEmbeddingUseCase(queue),
    );
  });

  describe("ownership", () => {
    it("refuses to let another user edit a role and leaves it untouched", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await expect(
        sut.execute({
          userId: ATTACKER_ID,
          workExperienceId: role.id,
          title: "Janitor",
          companyName: "Nowhere",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const stored = await workExperienceRepository.findById(role.id);
      expect(stored?.title).toBe("Engineer");
      expect(stored?.companyName).toBe("Acme Corp");
      expect(stored?.userId).toBe(OWNER_ID);
    });

    it("answers a forbidden edit with 403 and the ownership message", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await expect(
        sut.execute({
          userId: ATTACKER_ID,
          workExperienceId: role.id,
          title: "Janitor",
        }),
      ).rejects.toMatchObject({
        statusCode: 403,
        message: "You can only edit your own work experiences",
      });
    });

    it("does not re-embed anybody's resume when the edit is refused", async () => {
      const role = await workExperienceRepository.create(makeRole());
      await resumesRepository.upsertByUserId(OWNER_ID, {
        headlineTitle: "Engineer",
      });
      await resumesRepository.upsertByUserId(ATTACKER_ID, {
        headlineTitle: "Attacker",
      });

      await expect(
        sut.execute({
          userId: ATTACKER_ID,
          workExperienceId: role.id,
          title: "Janitor",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(queue.jobs).toHaveLength(0);
    });

    it("rejects an unknown id as 404 before any ownership question is asked", async () => {
      await expect(
        sut.execute({
          userId: OWNER_ID,
          workExperienceId: "does-not-exist",
          title: "Whatever",
        }),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);

      await expect(
        sut.execute({
          userId: OWNER_ID,
          workExperienceId: "does-not-exist",
        }),
      ).rejects.toMatchObject({
        statusCode: 404,
        message:
          "Work experience with identifier 'does-not-exist' not found",
      });
    });
  });

  describe("partial updates", () => {
    it("changes only the fields that were provided", async () => {
      const role = await workExperienceRepository.create(makeRole());

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Staff Engineer",
      });

      expect(updated.title).toBe("Staff Engineer");
      expect(updated.companyName).toBe("Acme Corp");
      expect(updated.description).toBe("Built things");
      expect(updated.locationCity).toBe("Berlin");
      expect(updated.mainStack).toEqual(["typescript"]);
      expect(updated.startDate).toBe("2020-01-01");
      expect(updated.endDate).toBe("2022-01-01");
    });

    it("treats an explicit null as a clear, and an omitted field as leave-alone", async () => {
      const role = await workExperienceRepository.create(makeRole());

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        description: null,
        locationCity: null,
      });

      expect(updated.description).toBeNull();
      expect(updated.locationCity).toBeNull();
      // Not mentioned in the input, so untouched.
      expect(updated.locationState).toBe("BE");
      expect(updated.locationCountry).toBe("DE");
    });

    it("an empty mainStack array clears the stack, unlike an omitted one", async () => {
      const role = await workExperienceRepository.create(makeRole());

      const cleared = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        mainStack: [],
      });
      expect(cleared.mainStack).toEqual([]);

      const untouched = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Engineer II",
      });
      expect(untouched.mainStack).toEqual([]);
    });

    it("bumps updatedAt on every accepted edit", async () => {
      const role = await workExperienceRepository.create(makeRole());
      const before = role.updatedAt.getTime();

      vi.useFakeTimers();
      vi.setSystemTime(new Date(before + 5_000));
      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Engineer II",
      });
      vi.useRealTimers();

      expect(updated.updatedAt.getTime()).toBeGreaterThan(before);
    });

    it("persists the edit through the repository, not just on the returned object", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        companyName: "Globex",
      });

      const stored = await workExperienceRepository.findById(role.id);
      expect(stored?.companyName).toBe("Globex");
    });
  });

  describe("dates and the current-role rule", () => {
    it("clears the end date when the role is marked current", async () => {
      const role = await workExperienceRepository.create(makeRole());

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        isCurrent: true,
      });

      expect(updated.isCurrent).toBe(true);
      expect(updated.endDate).toBeNull();
    });

    it("lets a current role be ended by sending isCurrent:false with the end date", async () => {
      const role = await workExperienceRepository.create(
        makeRole({ isCurrent: true, endDate: null }),
      );

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        isCurrent: false,
        endDate: "2024-06-01",
      });

      expect(updated.isCurrent).toBe(false);
      expect(updated.endDate).toBe("2024-06-01");
    });

    // CHARACTERIZATION: this is today's behaviour and it is WRONG — a partial
    // update that sends only `endDate` against a role stored as `isCurrent:true`
    // is accepted (the schema's isCurrent+endDate refine only sees the partial
    // body, where isCurrent is undefined) and then silently discarded by
    // WorkExperienceEntity.updateContent's "a current role can't keep a stale
    // end date" rule. The caller gets a 200 and no end date.
    it("silently drops an end date sent alone against a role stored as current", async () => {
      const role = await workExperienceRepository.create(
        makeRole({ isCurrent: true, endDate: null }),
      );

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        endDate: "2024-06-01",
      });

      expect(updated.endDate).toBeNull();
      expect(updated.isCurrent).toBe(true);
    });

    // CHARACTERIZATION: this is today's behaviour and it is WRONG — neither the
    // use case nor the entity compares startDate to endDate, and the schema's
    // refine only sees the fields present in the partial body. Sending an
    // endDate alone that precedes the STORED startDate is stored as-is.
    it("accepts an end date that precedes the stored start date", async () => {
      const role = await workExperienceRepository.create(
        makeRole({ startDate: "2023-01-01", endDate: "2024-01-01" }),
      );

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        endDate: "2019-01-01",
      });

      expect(updated.startDate).toBe("2023-01-01");
      expect(updated.endDate).toBe("2019-01-01");
    });

    // CHARACTERIZATION: same hole from the other side — moving the start date
    // forward past the stored end date is accepted.
    it("accepts a start date that follows the stored end date", async () => {
      const role = await workExperienceRepository.create(
        makeRole({ startDate: "2020-01-01", endDate: "2022-01-01" }),
      );

      const updated = await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        startDate: "2030-01-01",
      });

      expect(updated.startDate).toBe("2030-01-01");
      expect(updated.endDate).toBe("2022-01-01");
    });
  });

  describe("resume re-embedding", () => {
    it("enqueues a re-embed for the owner when they have a resume", async () => {
      const role = await workExperienceRepository.create(makeRole());
      await resumesRepository.upsertByUserId(OWNER_ID, {
        headlineTitle: "Engineer",
      });

      await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Staff Engineer",
      });

      expect(queue.jobs).toHaveLength(1);
      expect(queue.jobs[0]?.userId).toBe(OWNER_ID);
      expect(queue.jobs[0]?.reason).toBe("work-experience-changed");
    });

    it("does not enqueue when the user has no resume", async () => {
      const role = await workExperienceRepository.create(makeRole());

      await sut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Staff Engineer",
      });

      expect(queue.jobs).toHaveLength(0);
    });

    it("keeps the write when the re-embed fails — best-effort, no rollback, no throw", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const explodingQueue = new ExplodingResumeEmbeddingQueue();
      const sutWithBrokenQueue = new UpdateWorkExperienceUseCase(
        workExperienceRepository,
        resumesRepository,
        new EnqueueResumeEmbeddingUseCase(explodingQueue),
      );

      const role = await workExperienceRepository.create(makeRole());
      await resumesRepository.upsertByUserId(OWNER_ID, {
        headlineTitle: "Engineer",
      });

      const updated = await sutWithBrokenQueue.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Staff Engineer",
      });

      expect(updated.title).toBe("Staff Engineer");
      const stored = await workExperienceRepository.findById(role.id);
      expect(stored?.title).toBe("Staff Engineer");
      expect(explodingQueue.attempts).toHaveLength(1);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("works with the optional resume dependencies omitted", async () => {
      const bareSut = new UpdateWorkExperienceUseCase(
        workExperienceRepository,
      );
      const role = await workExperienceRepository.create(makeRole());

      const updated = await bareSut.execute({
        userId: OWNER_ID,
        workExperienceId: role.id,
        title: "Staff Engineer",
      });

      expect(updated.title).toBe("Staff Engineer");
      expect(queue.jobs).toHaveLength(0);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
