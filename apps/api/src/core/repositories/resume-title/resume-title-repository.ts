import { ResumeTitleEntity } from "../../entity/resume-title/resume-title-entity.js";

export interface IResumeTitleRepository {
  listByResumeId(resumeId: string): Promise<ResumeTitleEntity[]>;
  findLastOrderByResumeId(resumeId: string): Promise<number | null>;
  exists(resumeId: string, titleId: string): Promise<boolean>;
  create(input: {
    resumeId: string;
    titleId: string;
    isPrimary: boolean;
    displayOrder: number;
  }): Promise<ResumeTitleEntity>;
  clearPrimary(resumeId: string): Promise<void>;
}
