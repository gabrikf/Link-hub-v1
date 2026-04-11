import { ResumeSkillEntity } from "../../entity/resume-skill/resume-skill-entity.js";

export interface IResumeSkillRepository {
  listByResumeId(resumeId: string): Promise<ResumeSkillEntity[]>;
  findLastOrderByResumeId(resumeId: string): Promise<number | null>;
  exists(resumeId: string, skillId: string): Promise<boolean>;
  replaceForResume(
    resumeId: string,
    items: Array<{
      skillId: string;
      yearsExperience: number | null;
    }>,
  ): Promise<void>;
  create(input: {
    resumeId: string;
    skillId: string;
    yearsExperience: number | null;
    displayOrder: number;
  }): Promise<ResumeSkillEntity>;
}
