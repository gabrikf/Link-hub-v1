import { asc, eq, or } from "drizzle-orm";
import { TitleCatalogEntity } from "../../../../core/entity/title-catalog/title-catalog-entity.js";
import { ITitleCatalogRepository } from "../../../../core/repositories/title-catalog/title-catalog-repository.js";
import { db } from "../index.js";
import { titlesCatalog } from "../schema.js";

export class DrizzleTitleCatalogRepository implements ITitleCatalogRepository {
  async findById(id: string): Promise<TitleCatalogEntity | null> {
    const [item] = await db
      .select()
      .from(titlesCatalog)
      .where(eq(titlesCatalog.id, id));

    return item ? this.toEntity(item) : null;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<TitleCatalogEntity | null> {
    const [item] = await db
      .select()
      .from(titlesCatalog)
      .where(eq(titlesCatalog.normalizedName, normalizedName));

    return item ? this.toEntity(item) : null;
  }

  async listForUser(userId: string): Promise<TitleCatalogEntity[]> {
    const rows = await db
      .select()
      .from(titlesCatalog)
      .where(
        or(
          eq(titlesCatalog.isDefault, true),
          eq(titlesCatalog.createdByUserId, userId),
        ),
      )
      .orderBy(asc(titlesCatalog.name));

    return rows.map((row) => this.toEntity(row));
  }

  async create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<TitleCatalogEntity> {
    const [created] = await db
      .insert(titlesCatalog)
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
    data: typeof titlesCatalog.$inferSelect,
  ): TitleCatalogEntity {
    return new TitleCatalogEntity({
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
