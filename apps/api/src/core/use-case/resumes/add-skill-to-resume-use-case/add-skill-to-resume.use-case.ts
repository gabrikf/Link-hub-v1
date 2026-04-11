import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeSkillRepository } from "../../../repositories/resume-skill/resume-skill-repository.js";
import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";

export interface IAddSkillToResumeInput {
  userId: string;
  skillId: string;
  yearsExperience?: number | null;
}

export class AddSkillToResumeUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private skillCatalogRepository: ISkillCatalogRepository,
    private resumeSkillRepository: IResumeSkillRepository,
  ) {}

  async execute(input: IAddSkillToResumeInput) {
    const resume = await this.resumesRepository.findByUserId(input.userId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", input.userId);
    }

    const skill = await this.skillCatalogRepository.findById(input.skillId);

    if (!skill) {
      throw new ResourceNotFoundError("Skill", input.skillId);
    }

    const alreadyAdded = await this.resumeSkillRepository.exists(
      resume.id,
      input.skillId,
    );

    if (alreadyAdded) {
      throw new DuplicateResourceError(
        "Resume skill",
        "skillId",
        input.skillId,
      );
    }

    const lastOrder = await this.resumeSkillRepository.findLastOrderByResumeId(
      resume.id,
    );

    return this.resumeSkillRepository.create({
      resumeId: resume.id,
      skillId: input.skillId,
      yearsExperience: input.yearsExperience ?? null,
      displayOrder: lastOrder === null ? 0 : lastOrder + 1,
    });
  }
}
