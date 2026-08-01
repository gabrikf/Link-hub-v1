import { SkillCatalogEntity } from "../../entity/skill-catalog/skill-catalog-entity.js";

export interface ISkillCatalogRepository {
  findById(id: string): Promise<SkillCatalogEntity | null>;
  findByNormalizedName(
    normalizedName: string,
  ): Promise<SkillCatalogEntity | null>;
  /**
   * Batch counterpart of {@link findByNormalizedName}. An AI resume import
   * resolves thirty-odd names at once; one round trip beats thirty.
   */
  findManyByNormalizedNames(
    normalizedNames: string[],
  ): Promise<SkillCatalogEntity[]>;
  listForUser(userId: string): Promise<SkillCatalogEntity[]>;
  create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<SkillCatalogEntity>;
  /**
   * Inserts every name that is not already in the catalog and returns the rows
   * for ALL requested names, created or pre-existing. Must tolerate a
   * concurrent writer inserting the same name: the caller wants an id, not
   * ownership of the insert.
   */
  createMany(
    inputs: Array<{
      name: string;
      normalizedName: string;
      isDefault: boolean;
      createdByUserId: string | null;
    }>,
  ): Promise<SkillCatalogEntity[]>;
}
