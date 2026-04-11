import { eq } from "drizzle-orm";
import { ResumeEntity } from "../../../../core/entity/resume/resume-entity.js";
import {
  IResumesRepository,
  ResumeUpsertData,
} from "../../../../core/repositories/resume/resume-repository.js";
import { db } from "../index.js";
import { resumes } from "../schema.js";

export class DrizzleResumesRepository implements IResumesRepository {
  async findById(id: string): Promise<ResumeEntity | null> {
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, id));

    return resume ? this.toEntity(resume) : null;
  }

  async findByUserId(userId: string): Promise<ResumeEntity | null> {
    const [resume] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId));

    return resume ? this.toEntity(resume) : null;
  }

  async upsertByUserId(
    userId: string,
    data: ResumeUpsertData,
  ): Promise<ResumeEntity> {
    const existing = await this.findByUserId(userId);

    if (!existing) {
      const [created] = await db
        .insert(resumes)
        .values({
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
        })
        .returning();

      return this.toEntity(created);
    }

    const [updated] = await db
      .update(resumes)
      .set({
        headlineTitle: data.headlineTitle,
        summary: data.summary,
        totalYearsExperience: data.totalYearsExperience,
        location: data.location,
        seniorityLevel: data.seniorityLevel,
        workModel: data.workModel,
        contractType: data.contractType,
        salaryExpectationMin: data.salaryExpectationMin,
        salaryExpectationMax: data.salaryExpectationMax,
        spokenLanguages: data.spokenLanguages,
        noticePeriod: data.noticePeriod,
        openToRelocation: data.openToRelocation,
        updatedAt: new Date(),
      })
      .where(eq(resumes.userId, userId))
      .returning();

    return this.toEntity(updated);
  }

  private toEntity(data: typeof resumes.$inferSelect): ResumeEntity {
    return new ResumeEntity({
      id: data.id,
      userId: data.userId,
      headlineTitle: data.headlineTitle,
      summary: data.summary,
      totalYearsExperience: data.totalYearsExperience,
      location: data.location,
      seniorityLevel: data.seniorityLevel,
      workModel: data.workModel,
      contractType: data.contractType,
      salaryExpectationMin: data.salaryExpectationMin,
      salaryExpectationMax: data.salaryExpectationMax,
      spokenLanguages: data.spokenLanguages,
      noticePeriod: data.noticePeriod,
      openToRelocation: data.openToRelocation,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
