import { TitleCatalogEntity } from "../../entity/title-catalog/title-catalog-entity.js";

export interface ITitleCatalogRepository {
  findById(id: string): Promise<TitleCatalogEntity | null>;
  findByNormalizedName(
    normalizedName: string,
  ): Promise<TitleCatalogEntity | null>;
  listForUser(userId: string): Promise<TitleCatalogEntity[]>;
  create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<TitleCatalogEntity>;
}
