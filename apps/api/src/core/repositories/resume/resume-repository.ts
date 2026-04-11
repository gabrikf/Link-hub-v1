import { ResumeEntity } from "../../entity/resume/resume-entity.js";

export interface ResumeUpsertData {
  headlineTitle?: string | null;
  summary?: string | null;
  totalYearsExperience?: number | null;
  location?: string | null;
  seniorityLevel?: string | null;
  workModel?: string | null;
  contractType?: string | null;
  salaryExpectationMin?: number | null;
  salaryExpectationMax?: number | null;
  spokenLanguages?: string[];
  noticePeriod?: string | null;
  openToRelocation?: boolean;
}

export interface IResumesRepository {
  findById(id: string): Promise<ResumeEntity | null>;
  findByUserId(userId: string): Promise<ResumeEntity | null>;
  upsertByUserId(userId: string, data: ResumeUpsertData): Promise<ResumeEntity>;
}
