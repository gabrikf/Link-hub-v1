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
  /**
   * Additive batch insert. Unlike {@link replaceForResume} it leaves existing
   * links alone, and skips rows the resume already has rather than failing on
   * the (resume_id, skill_id) unique constraint.
   */
  createMany(
    inputs: Array<{
      resumeId: string;
      skillId: string;
      yearsExperience: number | null;
      displayOrder: number;
    }>,
  ): Promise<void>;
}
