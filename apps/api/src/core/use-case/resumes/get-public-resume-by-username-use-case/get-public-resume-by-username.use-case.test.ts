import { beforeEach, describe, expect, it } from "vitest";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryResumesRepository } from "../../../repositories/resume/in-memory-resumes-repository.js";
import { InMemoryResumeSkillRepository } from "../../../repositories/resume-skill/in-memory-resume-skill-repository.js";
import { InMemoryResumeTitleRepository } from "../../../repositories/resume-title/in-memory-resume-title-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { GetPublicResumeByUsernameUseCase } from "./get-public-resume-by-username.use-case.js";

describe("GetPublicResumeByUsernameUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let resumesRepository: InMemoryResumesRepository;
  let resumeSkillRepository: InMemoryResumeSkillRepository;
  let resumeTitleRepository: InMemoryResumeTitleRepository;
  let sut: GetPublicResumeByUsernameUseCase;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    resumesRepository = new InMemoryResumesRepository();
    resumeSkillRepository = new InMemoryResumeSkillRepository();
    resumeTitleRepository = new InMemoryResumeTitleRepository();

    sut = new GetPublicResumeByUsernameUseCase(
      usersRepository,
      resumesRepository,
      resumeSkillRepository,
      resumeTitleRepository,
    );
  });

  it("should return public resume payload by username", async () => {
    const user = UserEntity.create({
      email: "public@example.com",
      login: "public-dev",
      name: "Public Dev",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const resume = await resumesRepository.upsertByUserId(user.id, {
      headlineTitle: "Fullstack Engineer",
      summary: "Public summary",
      totalYearsExperience: 7,
      location: "Brazil",
      seniorityLevel: "senior",
      workModel: "remote",
      contractType: "pj",
      spokenLanguages: ["Portuguese", "English"],
      openToRelocation: true,
    });

    resumeSkillRepository.seed(
      ResumeSkillEntity.create({
        resumeId: resume.id,
        skillId: "skill-1",
        skillName: "Node",
        yearsExperience: 6,
        displayOrder: 0,
      }),
    );

    resumeTitleRepository.seed(
      ResumeTitleEntity.create({
        resumeId: resume.id,
        titleId: "title-1",
        titleName: "Software Engineer",
        isPrimary: true,
        displayOrder: 0,
      }),
    );

    const result = await sut.execute("public-dev");

    expect(result.headlineTitle).toBe("Fullstack Engineer");
    expect(result.skills).toHaveLength(1);
    expect(result.titles).toHaveLength(1);
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("userId");
  });

  it("should throw when user is not found", async () => {
    await expect(sut.execute("missing-user")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("should throw when resume is not found", async () => {
    const user = UserEntity.create({
      email: "public2@example.com",
      login: "public-dev-2",
      name: "Public Dev 2",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    await expect(sut.execute("public-dev-2")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });
});
