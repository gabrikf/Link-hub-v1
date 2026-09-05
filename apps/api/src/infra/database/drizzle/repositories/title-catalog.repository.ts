import { asc, eq, inArray, or } from "drizzle-orm";
import { TitleCatalogEntity } from "../../../../core/entity/title-catalog/title-catalog-entity.js";
import { ITitleCatalogRepository } from "../../../../core/repositories/title-catalog/title-catalog-repository.js";
import { db } from "../index.js";
import { titlesCatalog } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

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

  async findManyByNormalizedNames(
    normalizedNames: string[],
  ): Promise<TitleCatalogEntity[]> {
    if (normalizedNames.length === 0) {
      return [];
    }

    const rows = await db
      .select()
      .from(titlesCatalog)
      .where(inArray(titlesCatalog.normalizedName, normalizedNames));

    return rows.map((row) => this.toEntity(row));
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
    const insertedRows = await db
      .insert(titlesCatalog)
      .values({
        name: input.name,
        normalizedName: input.normalizedName,
        isDefault: input.isDefault,
        createdByUserId: input.createdByUserId,
      })
      .returning();

    return this.toEntity(
      requireReturnedRow(insertedRows, "insert into titlesCatalog"),
    );
  }

  async createMany(
    inputs: Array<{
      name: string;
      normalizedName: string;
      isDefault: boolean;
      createdByUserId: string | null;
    }>,
  ): Promise<TitleCatalogEntity[]> {
    if (inputs.length === 0) {
      return [];
    }

    // `onConflictDoNothing` rather than a plain insert: two imports running at
    // once can race on the same title name, and the loser wants the winner's
    // id, not a unique-violation. The re-read below is what makes that work —
    // conflicted rows are absent from `returning()`.
    await db.insert(titlesCatalog).values(inputs).onConflictDoNothing();

    return this.findManyByNormalizedNames(
      inputs.map((input) => input.normalizedName),
    );
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
