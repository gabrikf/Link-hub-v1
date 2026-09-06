import { asc, eq, inArray, or } from "drizzle-orm";
import { SkillCatalogEntity } from "../../../../core/entity/skill-catalog/skill-catalog-entity.js";
import { ISkillCatalogRepository } from "../../../../core/repositories/skill-catalog/skill-catalog-repository.js";
import { db } from "../index.js";
import { skillsCatalog } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

export class DrizzleSkillCatalogRepository implements ISkillCatalogRepository {
  async findById(id: string): Promise<SkillCatalogEntity | null> {
    const [item] = await db
      .select()
      .from(skillsCatalog)
      .where(eq(skillsCatalog.id, id));

    return item ? this.toEntity(item) : null;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<SkillCatalogEntity | null> {
    const [item] = await db
      .select()
      .from(skillsCatalog)
      .where(eq(skillsCatalog.normalizedName, normalizedName));

    return item ? this.toEntity(item) : null;
  }

  async findManyByNormalizedNames(
    normalizedNames: string[],
  ): Promise<SkillCatalogEntity[]> {
    if (normalizedNames.length === 0) {
      return [];
    }

    const rows = await db
      .select()
      .from(skillsCatalog)
      .where(inArray(skillsCatalog.normalizedName, normalizedNames));

    return rows.map((row) => this.toEntity(row));
  }

  async listForUser(userId: string): Promise<SkillCatalogEntity[]> {
    const rows = await db
      .select()
      .from(skillsCatalog)
      .where(
        or(
          eq(skillsCatalog.isDefault, true),
          eq(skillsCatalog.createdByUserId, userId),
        ),
      )
      .orderBy(asc(skillsCatalog.name));

    return rows.map((row) => this.toEntity(row));
  }

  async create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<SkillCatalogEntity> {
    const insertedRows = await db
      .insert(skillsCatalog)
      .values({
        name: input.name,
        normalizedName: input.normalizedName,
        isDefault: input.isDefault,
        createdByUserId: input.createdByUserId,
      })
      .returning();

    return this.toEntity(
      requireReturnedRow(insertedRows, "insert into skillsCatalog"),
    );
  }

  async createMany(
    inputs: Array<{
      name: string;
      normalizedName: string;
      isDefault: boolean;
      createdByUserId: string | null;
    }>,
  ): Promise<SkillCatalogEntity[]> {
    if (inputs.length === 0) {
      return [];
    }

    // `onConflictDoNothing` rather than a plain insert: two imports running at
    // once can race on the same skill name, and the loser wants the winner's
    // id, not a unique-violation. The re-read below is what makes that work —
    // conflicted rows are absent from `returning()`.
    await db.insert(skillsCatalog).values(inputs).onConflictDoNothing();

    return this.findManyByNormalizedNames(
      inputs.map((input) => input.normalizedName),
    );
  }

  private toEntity(
    data: typeof skillsCatalog.$inferSelect,
  ): SkillCatalogEntity {
    return new SkillCatalogEntity({
      id: data.id,
      name: data.name,
      normalizedName: data.normalizedName,
      isDefault: data.isDefault,
      createdByUserId: data.createdByUserId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
