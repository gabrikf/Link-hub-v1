import { eq } from "drizzle-orm";
import { ResumeEntity } from "../../../../core/entity/resume/resume-entity.js";
import {
  IResumesRepository,
  ResumeUpsertData,
} from "../../../../core/repositories/resume/resume-repository.js";
import { db } from "../index.js";
import { resumes } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

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
      const insertedRows = await db
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

      return this.toEntity(
        requireReturnedRow(insertedRows, "insert into resumes"),
      );
    }

    const updatedRows = await db
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

    // An UPDATE whose WHERE matches nothing returns an empty array: the row read
    // by `findByUserId` above can be deleted between that read and this write.
    // Before `noUncheckedIndexedAccess` this fell through to the mapper and blew
    // up there as `Cannot read properties of undefined (reading 'id')`.
    return this.toEntity(
      requireReturnedRow(updatedRows, "update resumes by userId"),
    );
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
