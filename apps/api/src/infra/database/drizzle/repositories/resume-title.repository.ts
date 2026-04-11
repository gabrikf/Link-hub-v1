import { and, asc, desc, eq } from "drizzle-orm";
import { ResumeTitleEntity } from "../../../../core/entity/resume-title/resume-title-entity.js";
import { IResumeTitleRepository } from "../../../../core/repositories/resume-title/resume-title-repository.js";
import { db } from "../index.js";
import { resumeTitles, titlesCatalog } from "../schema.js";

export class DrizzleResumeTitleRepository implements IResumeTitleRepository {
  async listByResumeId(resumeId: string): Promise<ResumeTitleEntity[]> {
    const rows = await db
      .select({
        id: resumeTitles.id,
        resumeId: resumeTitles.resumeId,
        titleId: resumeTitles.titleId,
        titleName: titlesCatalog.name,
        isPrimary: resumeTitles.isPrimary,
        displayOrder: resumeTitles.displayOrder,
        createdAt: resumeTitles.createdAt,
        updatedAt: resumeTitles.updatedAt,
      })
      .from(resumeTitles)
      .innerJoin(titlesCatalog, eq(resumeTitles.titleId, titlesCatalog.id))
      .where(eq(resumeTitles.resumeId, resumeId))
      .orderBy(asc(resumeTitles.displayOrder), asc(resumeTitles.createdAt));

    return rows.map(
      (row) =>
        new ResumeTitleEntity({
          id: row.id,
          resumeId: row.resumeId,
          titleId: row.titleId,
          titleName: row.titleName,
          isPrimary: row.isPrimary,
          displayOrder: row.displayOrder,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }),
    );
  }

  async findLastOrderByResumeId(resumeId: string): Promise<number | null> {
    const [row] = await db
      .select({ displayOrder: resumeTitles.displayOrder })
      .from(resumeTitles)
      .where(eq(resumeTitles.resumeId, resumeId))
      .orderBy(desc(resumeTitles.displayOrder))
      .limit(1);

    return row?.displayOrder ?? null;
  }

  async exists(resumeId: string, titleId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: resumeTitles.id })
      .from(resumeTitles)
      .where(
        and(
          eq(resumeTitles.resumeId, resumeId),
          eq(resumeTitles.titleId, titleId),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async clearPrimary(resumeId: string): Promise<void> {
    await db
      .update(resumeTitles)
      .set({
        isPrimary: false,
        updatedAt: new Date(),
      })
      .where(eq(resumeTitles.resumeId, resumeId));
  }

  async create(input: {
    resumeId: string;
    titleId: string;
    isPrimary: boolean;
    displayOrder: number;
  }): Promise<ResumeTitleEntity> {
    const [created] = await db
      .insert(resumeTitles)
      .values({
        resumeId: input.resumeId,
        titleId: input.titleId,
        isPrimary: input.isPrimary,
        displayOrder: input.displayOrder,
      })
      .returning();

    const [joined] = await db
      .select({
        titleName: titlesCatalog.name,
      })
      .from(titlesCatalog)
      .where(eq(titlesCatalog.id, created.titleId))
      .limit(1);

    return new ResumeTitleEntity({
      id: created.id,
      resumeId: created.resumeId,
      titleId: created.titleId,
      titleName: joined?.titleName ?? "",
      isPrimary: created.isPrimary,
      displayOrder: created.displayOrder,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  }
}
