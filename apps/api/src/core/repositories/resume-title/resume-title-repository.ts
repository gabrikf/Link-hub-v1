import { ResumeTitleEntity } from "../../entity/resume-title/resume-title-entity.js";

export interface IResumeTitleRepository {
  listByResumeId(resumeId: string): Promise<ResumeTitleEntity[]>;
  findLastOrderByResumeId(resumeId: string): Promise<number | null>;
  exists(resumeId: string, titleId: string): Promise<boolean>;
  replaceForResume(
    resumeId: string,
    items: Array<{
      titleId: string;
      isPrimary: boolean;
    }>,
  ): Promise<void>;
  create(input: {
    resumeId: string;
    titleId: string;
    isPrimary: boolean;
    displayOrder: number;
  }): Promise<ResumeTitleEntity>;
  /**
   * Additive batch insert. Unlike {@link replaceForResume} it leaves existing
   * links alone, and skips rows the resume already has rather than failing on
   * the (resume_id, title_id) unique constraint.
   */
  createMany(
    inputs: Array<{
      resumeId: string;
      titleId: string;
      isPrimary: boolean;
      displayOrder: number;
    }>,
  ): Promise<void>;
  clearPrimary(resumeId: string): Promise<void>;
}
