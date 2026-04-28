import { beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { InMemoryTitleCatalogRepository } from "../../../repositories/title-catalog/in-memory-title-catalog-repository.js";
import { InMemoryResumeEmbeddingQueue } from "../../../providers/queue/in-memory-resume-embedding-queue.js";
import { EnqueueResumeEmbeddingUseCase } from "../enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { AddTitleToResumeUseCase } from "./add-title-to-resume.use-case.js";

describe("AddTitleToResumeUseCase", () => {
  let resumesRepository: InMemoryResumesRepository;
  let titleCatalogRepository: InMemoryTitleCatalogRepository;
  let resumeTitleRepository: InMemoryResumeTitleRepository;
  let resumeEmbeddingQueue: InMemoryResumeEmbeddingQueue;
  let sut: AddTitleToResumeUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    titleCatalogRepository = new InMemoryTitleCatalogRepository();
    resumeTitleRepository = new InMemoryResumeTitleRepository();
    resumeEmbeddingQueue = new InMemoryResumeEmbeddingQueue();

    sut = new AddTitleToResumeUseCase(
      resumesRepository,
      titleCatalogRepository,
      resumeTitleRepository,
      new EnqueueResumeEmbeddingUseCase(resumeEmbeddingQueue),
    );
  });

  it("should add title and set order", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Dev",
    });

    const firstTitle = await titleCatalogRepository.create({
      name: "Software Engineer",
      normalizedName: "software engineer",
      isDefault: true,
      createdByUserId: null,
    });

    const secondTitle = await titleCatalogRepository.create({
      name: "Tech Lead",
      normalizedName: "tech lead",
      isDefault: true,
      createdByUserId: null,
    });

    await resumeTitleRepository.create({
      resumeId: resume.id,
      titleId: firstTitle.id,
      isPrimary: false,
      displayOrder: 0,
    });

    const created = await sut.execute({
      userId: "user-1",
      titleId: secondTitle.id,
      isPrimary: false,
    });

    expect(created.displayOrder).toBe(1);
    expect(created.isPrimary).toBe(false);
    expect(resumeEmbeddingQueue.jobs).toHaveLength(1);
  });

  it("should clear previous primary title when adding a new primary", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Dev",
    });

    const firstTitle = await titleCatalogRepository.create({
      name: "Software Engineer",
      normalizedName: "software engineer",
      isDefault: true,
      createdByUserId: null,
    });

    const secondTitle = await titleCatalogRepository.create({
      name: "Principal Engineer",
      normalizedName: "principal engineer",
      isDefault: true,
      createdByUserId: null,
    });

    await resumeTitleRepository.create({
      resumeId: resume.id,
      titleId: firstTitle.id,
      isPrimary: true,
      displayOrder: 0,
    });

    await sut.execute({
      userId: "user-1",
      titleId: secondTitle.id,
      isPrimary: true,
    });

    const titles = await resumeTitleRepository.listByResumeId(resume.id);

    expect(titles.filter((title) => title.isPrimary)).toHaveLength(1);
    expect(
      titles.find((title) => title.titleId === secondTitle.id)?.isPrimary,
    ).toBe(true);
  });

  it("should throw when resume is not found", async () => {
    const title = await titleCatalogRepository.create({
      name: "Software Engineer",
      normalizedName: "software engineer",
      isDefault: true,
      createdByUserId: null,
    });

    await expect(
      sut.execute({ userId: "missing-user", titleId: title.id }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("should throw when title is not found", async () => {
    await resumesRepository.upsertByUserId("user-1", { headlineTitle: "Dev" });

    await expect(
      sut.execute({ userId: "user-1", titleId: "missing-title" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("should throw when title already added", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Dev",
    });

    const title = await titleCatalogRepository.create({
      name: "Software Engineer",
      normalizedName: "software engineer",
      isDefault: true,
      createdByUserId: null,
    });

    await resumeTitleRepository.create({
      resumeId: resume.id,
      titleId: title.id,
      isPrimary: false,
      displayOrder: 0,
    });

    await expect(
      sut.execute({ userId: "user-1", titleId: title.id }),
    ).rejects.toBeInstanceOf(DuplicateResourceError);
  });
});
