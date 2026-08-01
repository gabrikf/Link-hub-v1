import { TitleCatalogEntity } from "../../entity/title-catalog/title-catalog-entity.js";

export interface ITitleCatalogRepository {
  findById(id: string): Promise<TitleCatalogEntity | null>;
  findByNormalizedName(
    normalizedName: string,
  ): Promise<TitleCatalogEntity | null>;
  /**
   * Batch counterpart of {@link findByNormalizedName}. An AI resume import
   * resolves thirty-odd names at once; one round trip beats thirty.
   */
  findManyByNormalizedNames(
    normalizedNames: string[],
  ): Promise<TitleCatalogEntity[]>;
  listForUser(userId: string): Promise<TitleCatalogEntity[]>;
  create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<TitleCatalogEntity>;
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
  ): Promise<TitleCatalogEntity[]>;
}
