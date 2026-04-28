import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { InMemoryTitleCatalogRepository } from "../../../repositories/title-catalog/in-memory-title-catalog-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { SaveResumeTitlesBulkUseCase } from "./save-resume-titles-bulk.use-case.js";

describe("SaveResumeTitlesBulkUseCase", () => {
  let resumesRepository: InMemoryResumesRepository;
  let titleCatalogRepository: InMemoryTitleCatalogRepository;
  let resumeTitleRepository: InMemoryResumeTitleRepository;
  let resumeEmbeddingQueue: InMemoryResumeEmbeddingQueue;
  let sut: SaveResumeTitlesBulkUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    titleCatalogRepository = new InMemoryTitleCatalogRepository();
    resumeTitleRepository = new InMemoryResumeTitleRepository();
    resumeEmbeddingQueue = new InMemoryResumeEmbeddingQueue();

    sut = new SaveResumeTitlesBulkUseCase(
      resumesRepository,
      titleCatalogRepository,
      resumeTitleRepository,
      new EnqueueResumeEmbeddingUseCase(resumeEmbeddingQueue),
    );
  });

  it("replaces titles and enqueues embedding job", async () => {
    await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
    });

    const titleA = await titleCatalogRepository.create({
      name: "Software Engineer",
      normalizedName: "software engineer",
      isDefault: true,
      createdByUserId: null,
    });

    const titleB = await titleCatalogRepository.create({
      name: "Senior Engineer",
      normalizedName: "senior engineer",
      isDefault: true,
      createdByUserId: null,
    });

    const result = await sut.execute({
      userId: "user-1",
      items: [
        { titleId: titleA.id, isPrimary: false },
        { titleId: titleB.id, isPrimary: true },
      ],
    });

    expect(result).toHaveLength(2);
    expect(resumeEmbeddingQueue.jobs).toHaveLength(1);
    expect(resumeEmbeddingQueue.jobs[0]?.reason).toBe("resume-titles-replaced");
  });
});
