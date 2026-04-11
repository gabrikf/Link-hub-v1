import { beforeEach, describe, expect, it } from "vitest";
import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { GetMyResumeUseCase } from "./get-my-resume.use-case.js";

describe("GetMyResumeUseCase", () => {
  let resumesRepository: InMemoryResumesRepository;
  let resumeSkillRepository: InMemoryResumeSkillRepository;
  let resumeTitleRepository: InMemoryResumeTitleRepository;
  let sut: GetMyResumeUseCase;

  beforeEach(() => {
    resumesRepository = new InMemoryResumesRepository();
    resumeSkillRepository = new InMemoryResumeSkillRepository();
    resumeTitleRepository = new InMemoryResumeTitleRepository();

    sut = new GetMyResumeUseCase(
      resumesRepository,
      resumeSkillRepository,
      resumeTitleRepository,
    );
  });

  it("should return resume with skills and titles", async () => {
    const resume = ResumeEntity.create({
      userId: "user-1",
      headlineTitle: "Fullstack Engineer",
      summary: "Building products",
      totalYearsExperience: 6,
      location: "Sao Paulo",
      seniorityLevel: "senior",
      workModel: "remote",
      contractType: "pj",
      salaryExpectationMin: 12000,
      salaryExpectationMax: 18000,
      spokenLanguages: ["Portuguese", "English"],
      noticePeriod: "30 days",
      openToRelocation: true,
    });

    await resumesRepository.upsertByUserId(resume.userId, {
      headlineTitle: resume.headlineTitle,
      summary: resume.summary,
      totalYearsExperience: resume.totalYearsExperience,
      location: resume.location,
      seniorityLevel: resume.seniorityLevel,
      workModel: resume.workModel,
      contractType: resume.contractType,
      salaryExpectationMin: resume.salaryExpectationMin,
      salaryExpectationMax: resume.salaryExpectationMax,
      spokenLanguages: resume.spokenLanguages,
      noticePeriod: resume.noticePeriod,
      openToRelocation: resume.openToRelocation,
    });

    const storedResume = await resumesRepository.findByUserId("user-1");

    resumeSkillRepository.seed(
      ResumeSkillEntity.create({
        resumeId: storedResume!.id,
        skillId: "skill-1",
        skillName: "TypeScript",
        yearsExperience: 5,
        displayOrder: 0,
      }),
    );

    resumeTitleRepository.seed(
      ResumeTitleEntity.create({
        resumeId: storedResume!.id,
        titleId: "title-1",
        titleName: "Tech Lead",
        isPrimary: true,
        displayOrder: 0,
      }),
    );

    const result = await sut.execute("user-1");

    expect(result.headlineTitle).toBe("Fullstack Engineer");
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].skillName).toBe("TypeScript");
    expect(result.titles).toHaveLength(1);
    expect(result.titles[0].titleName).toBe("Tech Lead");
  });

  it("should throw when resume is not found", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
