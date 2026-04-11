import { SkillCatalogEntity } from "../../entity/skill-catalog/skill-catalog-entity.js";
import { ISkillCatalogRepository } from "./skill-catalog-repository.js";

export class InMemorySkillCatalogRepository implements ISkillCatalogRepository {
  private items: SkillCatalogEntity[] = [];

  async findById(id: string): Promise<SkillCatalogEntity | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<SkillCatalogEntity | null> {
    return (
      this.items.find((item) => item.normalizedName === normalizedName) ?? null
    );
  }

  async listForUser(userId: string): Promise<SkillCatalogEntity[]> {
    return this.items.filter(
      (item) => item.isDefault || item.createdByUserId === userId,
    );
  }

  async create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<SkillCatalogEntity> {
    const created = SkillCatalogEntity.create({
      name: input.name,
      normalizedName: input.normalizedName,
      isDefault: input.isDefault,
      createdByUserId: input.createdByUserId,
    });

    this.items.push(created);
    return created;
  }

  seed(item: SkillCatalogEntity) {
    this.items.push(item);
  }
}
