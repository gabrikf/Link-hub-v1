import { SkillCatalogEntity } from "../../entity/skill-catalog/skill-catalog-entity.js";

export interface ISkillCatalogRepository {
  findById(id: string): Promise<SkillCatalogEntity | null>;
  findByNormalizedName(
    normalizedName: string,
  ): Promise<SkillCatalogEntity | null>;
  listForUser(userId: string): Promise<SkillCatalogEntity[]>;
  create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<SkillCatalogEntity>;
}
