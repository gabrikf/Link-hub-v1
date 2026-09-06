import { asc, desc, eq } from "drizzle-orm";
import type { AgentDisclosureLevel } from "@repo/schemas";
import { WorkExperienceEntity } from "../../../../core/entity/work-experience/work-experience-entity.js";
import { IWorkExperienceRepository } from "../../../../core/repositories/work-experience/work-experience-repository.js";
import { db } from "../index.js";
import { workExperiences } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

type WorkExperienceRow = typeof workExperiences.$inferSelect;

function toEntity(row: WorkExperienceRow): WorkExperienceEntity {
  return new WorkExperienceEntity({
    id: row.id,
    userId: row.userId,
    title: row.title,
    companyName: row.companyName,
    employmentType: row.employmentType,
    workModel: row.workModel,
    locationCity: row.locationCity,
    locationState: row.locationState,
    locationCountry: row.locationCountry,
    startDate: row.startDate,
    endDate: row.endDate,
    isCurrent: row.isCurrent,
    description: row.description,
    mainStack: row.mainStack,
    disclosureLevel: row.disclosureLevel as AgentDisclosureLevel | null,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleWorkExperienceRepository
  implements IWorkExperienceRepository
{
  async findById(id: string): Promise<WorkExperienceEntity | null> {
    const [row] = await db
      .select()
      .from(workExperiences)
      .where(eq(workExperiences.id, id));

    return row ? toEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<WorkExperienceEntity[]> {
    const rows = await db
      .select()
      .from(workExperiences)
      .where(eq(workExperiences.userId, userId))
      .orderBy(
        asc(workExperiences.displayOrder),
        desc(workExperiences.startDate),
        desc(workExperiences.createdAt),
      );

    return rows.map(toEntity);
  }

  async findLastOrderByUserId(userId: string): Promise<number | null> {
    const [row] = await db
      .select({ displayOrder: workExperiences.displayOrder })
      .from(workExperiences)
      .where(eq(workExperiences.userId, userId))
      .orderBy(desc(workExperiences.displayOrder))
      .limit(1);

    return row?.displayOrder ?? null;
  }

  async create(
    workExperience: WorkExperienceEntity,
  ): Promise<WorkExperienceEntity> {
    const insertedRows = await db
      .insert(workExperiences)
      .values({
        id: workExperience.id,
        userId: workExperience.userId,
        title: workExperience.title,
        companyName: workExperience.companyName,
        employmentType: workExperience.employmentType,
        workModel: workExperience.workModel,
        locationCity: workExperience.locationCity,
        locationState: workExperience.locationState,
        locationCountry: workExperience.locationCountry,
        startDate: workExperience.startDate,
        endDate: workExperience.endDate,
        isCurrent: workExperience.isCurrent,
        description: workExperience.description,
        mainStack: workExperience.mainStack,
        disclosureLevel: workExperience.disclosureLevel,
        displayOrder: workExperience.displayOrder,
        createdAt: workExperience.createdAt,
        updatedAt: workExperience.updatedAt,
      })
      .returning();

    return toEntity(
      requireReturnedRow(insertedRows, "insert into workExperiences"),
    );
  }

  async update(
    workExperience: WorkExperienceEntity,
  ): Promise<WorkExperienceEntity> {
    const [updated] = await db
      .update(workExperiences)
      .set({
        title: workExperience.title,
        companyName: workExperience.companyName,
        employmentType: workExperience.employmentType,
        workModel: workExperience.workModel,
        locationCity: workExperience.locationCity,
        locationState: workExperience.locationState,
        locationCountry: workExperience.locationCountry,
        startDate: workExperience.startDate,
        endDate: workExperience.endDate,
        isCurrent: workExperience.isCurrent,
        description: workExperience.description,
        mainStack: workExperience.mainStack,
        disclosureLevel: workExperience.disclosureLevel,
        displayOrder: workExperience.displayOrder,
        updatedAt: workExperience.updatedAt,
      })
      .where(eq(workExperiences.id, workExperience.id))
      .returning();

    if (!updated) {
      throw new Error(
        `Work experience with id '${workExperience.id}' not found`,
      );
    }

    return toEntity(updated);
  }

  async delete(id: string): Promise<void> {
    await db.delete(workExperiences).where(eq(workExperiences.id, id));
  }
}
