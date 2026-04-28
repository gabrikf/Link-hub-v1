import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemorySkillCatalogRepository } from "../../../repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { SaveResumeSkillsBulkUseCase } from "./save-resume-skills-bulk.use-case.js";

describe("SaveResumeSkillsBulkUseCase", () => {
  let resumesRepository: InMemoryResumesRepository;
  let skillCatalogRepository: InMemorySkillCatalogRepository;
  let resumeSkillRepository: InMemoryResumeSkillRepository;
  let resumeEmbeddingQueue: InMemoryResumeEmbeddingQueue;
  let sut: SaveResumeSkillsBulkUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    skillCatalogRepository = new InMemorySkillCatalogRepository();
    resumeSkillRepository = new InMemoryResumeSkillRepository();
    resumeEmbeddingQueue = new InMemoryResumeEmbeddingQueue();

    sut = new SaveResumeSkillsBulkUseCase(
      resumesRepository,
      skillCatalogRepository,
      resumeSkillRepository,
      new EnqueueResumeEmbeddingUseCase(resumeEmbeddingQueue),
    );
  });

  it("replaces skills and enqueues embedding job", async () => {
    await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
    });

    const skillA = await skillCatalogRepository.create({
      name: "Node",
      normalizedName: "node",
      isDefault: true,
      createdByUserId: null,
    });

    const skillB = await skillCatalogRepository.create({
      name: "TypeScript",
      normalizedName: "typescript",
      isDefault: true,
      createdByUserId: null,
    });

    const result = await sut.execute({
      userId: "user-1",
      items: [
        { skillId: skillA.id, yearsExperience: 3 },
        { skillId: skillB.id, yearsExperience: 4 },
      ],
    });

    expect(result).toHaveLength(2);
    expect(resumeEmbeddingQueue.jobs).toHaveLength(1);
    expect(resumeEmbeddingQueue.jobs[0]?.reason).toBe("resume-skills-replaced");
  });
});
