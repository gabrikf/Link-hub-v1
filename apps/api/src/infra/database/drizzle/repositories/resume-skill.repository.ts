import { and, asc, desc, eq } from "drizzle-orm";
import { ResumeSkillEntity } from "../../../../core/entity/resume-skill/resume-skill-entity.js";
import { IResumeSkillRepository } from "../../../../core/repositories/resume-skill/resume-skill-repository.js";
import { db } from "../index.js";
import { resumeSkills, skillsCatalog } from "../schema.js";

export class DrizzleResumeSkillRepository implements IResumeSkillRepository {
  async listByResumeId(resumeId: string): Promise<ResumeSkillEntity[]> {
    const rows = await db
      .select({
        id: resumeSkills.id,
        resumeId: resumeSkills.resumeId,
        skillId: resumeSkills.skillId,
        skillName: skillsCatalog.name,
        yearsExperience: resumeSkills.yearsExperience,
        displayOrder: resumeSkills.displayOrder,
        createdAt: resumeSkills.createdAt,
        updatedAt: resumeSkills.updatedAt,
      })
      .from(resumeSkills)
      .innerJoin(skillsCatalog, eq(resumeSkills.skillId, skillsCatalog.id))
      .where(eq(resumeSkills.resumeId, resumeId))
      .orderBy(asc(resumeSkills.displayOrder), asc(resumeSkills.createdAt));

    return rows.map(
      (row) =>
        new ResumeSkillEntity({
          id: row.id,
          resumeId: row.resumeId,
          skillId: row.skillId,
          skillName: row.skillName,
          yearsExperience: row.yearsExperience,
          displayOrder: row.displayOrder,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }),
    );
  }

  async findLastOrderByResumeId(resumeId: string): Promise<number | null> {
    const [row] = await db
      .select({ displayOrder: resumeSkills.displayOrder })
      .from(resumeSkills)
      .where(eq(resumeSkills.resumeId, resumeId))
      .orderBy(desc(resumeSkills.displayOrder))
      .limit(1);

    return row?.displayOrder ?? null;
  }

  async exists(resumeId: string, skillId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: resumeSkills.id })
      .from(resumeSkills)
      .where(
        and(
          eq(resumeSkills.resumeId, resumeId),
          eq(resumeSkills.skillId, skillId),
        ),
      )
      .limit(1);

    return Boolean(row);
  }

  async replaceForResume(
    resumeId: string,
    items: Array<{ skillId: string; yearsExperience: number | null }>,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(resumeSkills).where(eq(resumeSkills.resumeId, resumeId));

      if (items.length === 0) {
        return;
      }

      await tx.insert(resumeSkills).values(
        items.map((item, index) => ({
          resumeId,
          skillId: item.skillId,
          yearsExperience: item.yearsExperience,
          displayOrder: index,
        })),
      );
    });
  }

  async create(input: {
    resumeId: string;
    skillId: string;
    yearsExperience: number | null;
    displayOrder: number;
  }): Promise<ResumeSkillEntity> {
    const [created] = await db
      .insert(resumeSkills)
      .values({
        resumeId: input.resumeId,
        skillId: input.skillId,
        yearsExperience: input.yearsExperience,
        displayOrder: input.displayOrder,
      })
      .returning();

    const [joined] = await db
      .select({
        skillName: skillsCatalog.name,
      })
      .from(skillsCatalog)
      .where(eq(skillsCatalog.id, created.skillId))
      .limit(1);

    return new ResumeSkillEntity({
      id: created.id,
      resumeId: created.resumeId,
      skillId: created.skillId,
      skillName: joined?.skillName ?? "",
      yearsExperience: created.yearsExperience,
      displayOrder: created.displayOrder,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  }
}
