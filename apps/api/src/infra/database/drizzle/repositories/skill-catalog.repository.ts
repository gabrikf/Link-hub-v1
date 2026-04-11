import { asc, eq, or } from "drizzle-orm";
import { SkillCatalogEntity } from "../../../../core/entity/skill-catalog/skill-catalog-entity.js";
import { ISkillCatalogRepository } from "../../../../core/repositories/skill-catalog/skill-catalog-repository.js";
import { db } from "../index.js";
import { skillsCatalog } from "../schema.js";

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
    const [created] = await db
      .insert(skillsCatalog)
      .values({
        name: input.name,
        normalizedName: input.normalizedName,
        isDefault: input.isDefault,
        createdByUserId: input.createdByUserId,
      })
      .returning();

    return this.toEntity(created);
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
