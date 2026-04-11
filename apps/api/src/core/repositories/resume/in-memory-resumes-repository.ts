import { ResumeEntity } from "../../entity/resume/resume-entity.js";
import { IResumesRepository, ResumeUpsertData } from "./resume-repository.js";

export class InMemoryResumesRepository implements IResumesRepository {
  private resumes: ResumeEntity[] = [];

  async findById(id: string): Promise<ResumeEntity | null> {
    return this.resumes.find((resume) => resume.id === id) ?? null;
  }

  async findByUserId(userId: string): Promise<ResumeEntity | null> {
    return this.resumes.find((resume) => resume.userId === userId) ?? null;
  }

  async upsertByUserId(
    userId: string,
    data: ResumeUpsertData,
  ): Promise<ResumeEntity> {
    const existing = await this.findByUserId(userId);

    if (!existing) {
      const created = ResumeEntity.create({
        userId,
        headlineTitle: data.headlineTitle ?? null,
        summary: data.summary ?? null,
        totalYearsExperience: data.totalYearsExperience ?? null,
        location: data.location ?? null,
        seniorityLevel: data.seniorityLevel ?? null,
        workModel: data.workModel ?? null,
        contractType: data.contractType ?? null,
        salaryExpectationMin: data.salaryExpectationMin ?? null,
        salaryExpectationMax: data.salaryExpectationMax ?? null,
        spokenLanguages: data.spokenLanguages ?? [],
        noticePeriod: data.noticePeriod ?? null,
        openToRelocation: data.openToRelocation ?? false,
      });

      this.resumes.push(created);
      return created;
    }

    if (data.headlineTitle !== undefined)
      existing.headlineTitle = data.headlineTitle;
    if (data.summary !== undefined) existing.summary = data.summary;
    if (data.totalYearsExperience !== undefined) {
      existing.totalYearsExperience = data.totalYearsExperience;
    }
    if (data.location !== undefined) existing.location = data.location;
    if (data.seniorityLevel !== undefined)
      existing.seniorityLevel = data.seniorityLevel;
    if (data.workModel !== undefined) existing.workModel = data.workModel;
    if (data.contractType !== undefined)
      existing.contractType = data.contractType;
    if (data.salaryExpectationMin !== undefined) {
      existing.salaryExpectationMin = data.salaryExpectationMin;
    }
    if (data.salaryExpectationMax !== undefined) {
      existing.salaryExpectationMax = data.salaryExpectationMax;
    }
    if (data.spokenLanguages !== undefined)
      existing.spokenLanguages = data.spokenLanguages;
    if (data.noticePeriod !== undefined)
      existing.noticePeriod = data.noticePeriod;
    if (data.openToRelocation !== undefined) {
      existing.openToRelocation = data.openToRelocation;
    }

    existing.updateTimestamp();
    return existing;
  }

  count() {
    return this.resumes.length;
  }
}
