import { beforeEach, describe, expect, it } from "vitest";
import { SkillCatalogEntity } from "../../../entity/skill-catalog/skill-catalog-entity.js";
import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemorySkillCatalogRepository } from "../../../repositories/skill-catalog/in-memory-skill-catalog-repository.js";
import { AddSkillToResumeUseCase } from "./add-skill-to-resume.use-case.js";

describe("AddSkillToResumeUseCase", () => {
  let resumesRepository: InMemoryResumesRepository;
  let skillCatalogRepository: InMemorySkillCatalogRepository;
  let resumeSkillRepository: InMemoryResumeSkillRepository;
  let sut: AddSkillToResumeUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    skillCatalogRepository = new InMemorySkillCatalogRepository();
    resumeSkillRepository = new InMemoryResumeSkillRepository();

    sut = new AddSkillToResumeUseCase(
      resumesRepository,
      skillCatalogRepository,
      resumeSkillRepository,
    );
  });

  it("should add skill to resume with incremented order", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Backend Engineer",
    });

    const firstSkill = await skillCatalogRepository.create({
      name: "Node",
      normalizedName: "node",
      isDefault: true,
      createdByUserId: null,
    });

    const secondSkill = await skillCatalogRepository.create({
      name: "TypeScript",
      normalizedName: "typescript",
      isDefault: true,
      createdByUserId: null,
    });

    await resumeSkillRepository.create({
      resumeId: resume.id,
      skillId: firstSkill.id,
      yearsExperience: 3,
      displayOrder: 0,
    });

    const created = await sut.execute({
      userId: "user-1",
      skillId: secondSkill.id,
      yearsExperience: 4,
    });

    expect(created.yearsExperience).toBe(4);
    expect(created.displayOrder).toBe(1);
  });

  it("should throw when resume is not found", async () => {
    const skill = SkillCatalogEntity.create({
      name: "React",
      normalizedName: "react",
      isDefault: true,
      createdByUserId: null,
    });

    skillCatalogRepository.seed(skill);

    await expect(
      sut.execute({ userId: "missing-user", skillId: skill.id }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("should throw when skill is not found", async () => {
    await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Dev",
    });

    await expect(
      sut.execute({ userId: "user-1", skillId: "missing-skill" }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("should throw when skill already added to resume", async () => {
    const resume = await resumesRepository.upsertByUserId("user-1", {
      headlineTitle: "Dev",
    });

    const skill = await skillCatalogRepository.create({
      name: "React",
      normalizedName: "react",
      isDefault: true,
      createdByUserId: null,
    });

    await resumeSkillRepository.create({
      resumeId: resume.id,
      skillId: skill.id,
      yearsExperience: null,
      displayOrder: 0,
    });

    await expect(
      sut.execute({ userId: "user-1", skillId: skill.id }),
    ).rejects.toBeInstanceOf(DuplicateResourceError);
  });
});
