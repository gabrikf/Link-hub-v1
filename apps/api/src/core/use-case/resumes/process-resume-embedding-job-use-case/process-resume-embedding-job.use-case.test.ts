import { beforeEach, describe, expect, it } from "vitest";
import { IEmbeddingProvider } from "../../../providers/embedding/embedding-provider.js";
import { InMemoryResumeEmbeddingsRepository } from "../../../repositories/resume-embedding/in-memory-resume-embedding-repository.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { ProcessResumeEmbeddingJobUseCase } from "./process-resume-embedding-job.use-case.js";

class FakeEmbeddingProvider implements IEmbeddingProvider {
  public calls = 0;

  async createEmbedding(text: string): Promise<number[]> {
    this.calls += 1;

    if (!text.includes("TypeScript")) {
      throw new Error("Weighted text did not include expected content");
    }

    return [0.1, 0.2, 0.3];
  }
}

describe("ProcessResumeEmbeddingJobUseCase", () => {
  let resumesRepository: InMemoryResumesRepository;
  let resumeSkillRepository: InMemoryResumeSkillRepository;
  let resumeTitleRepository: InMemoryResumeTitleRepository;
  let resumeEmbeddingsRepository: InMemoryResumeEmbeddingsRepository;
  let embeddingProvider: FakeEmbeddingProvider;
  let sut: ProcessResumeEmbeddingJobUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    resumeSkillRepository = new InMemoryResumeSkillRepository();
    resumeTitleRepository = new InMemoryResumeTitleRepository();
    resumeEmbeddingsRepository = new InMemoryResumeEmbeddingsRepository();
    embeddingProvider = new FakeEmbeddingProvider();

    sut = new ProcessResumeEmbeddingJobUseCase(
      resumesRepository,
      resumeSkillRepository,
      resumeTitleRepository,
      resumeEmbeddingsRepository,
      embeddingProvider,
    );
  });

  it("generates and stores an embedding for a resume", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
      summary: "Node and TypeScript",
    });

    resumeSkillRepository.seed(
      ResumeSkillEntity.create({
        resumeId: resume.id,
        skillId: "skill-1",
        skillName: "TypeScript",
        yearsExperience: 5,
        displayOrder: 0,
      }),
    );

    resumeTitleRepository.seed(
      ResumeTitleEntity.create({
        resumeId: resume.id,
        titleId: "title-1",
        titleName: "Senior Engineer",
        isPrimary: true,
        displayOrder: 0,
      }),
    );

    await sut.execute({
      resumeId: resume.id,
      userId: "user-1",
      reason: "resume-upsert",
      triggeredAt: new Date().toISOString(),
    });

    const stored = await resumeEmbeddingsRepository.findByResumeId(resume.id);

    expect(stored).not.toBeNull();
    expect(stored?.embedding).toEqual([0.1, 0.2, 0.3]);
    expect(stored?.embeddingModel).toBeDefined();
    expect(stored?.contentHash).toBeDefined();
  });

  it("skips embedding generation if weighted content did not change", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
      summary: "Node and TypeScript",
    });

    resumeSkillRepository.seed(
      ResumeSkillEntity.create({
        resumeId: resume.id,
        skillId: "skill-1",
        skillName: "TypeScript",
        yearsExperience: 5,
        displayOrder: 0,
      }),
    );

    await sut.execute({
      resumeId: resume.id,
      userId: "user-1",
      reason: "resume-upsert",
      triggeredAt: new Date().toISOString(),
    });

    await sut.execute({
      resumeId: resume.id,
      userId: "user-1",
      reason: "resume-upsert",
      triggeredAt: new Date().toISOString(),
    });

    expect(embeddingProvider.calls).toBe(1);
  });
});
