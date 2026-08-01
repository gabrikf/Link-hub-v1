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

  async findManyByNormalizedNames(
    normalizedNames: string[],
  ): Promise<SkillCatalogEntity[]> {
    const wanted = new Set(normalizedNames);
    return this.items.filter((item) => wanted.has(item.normalizedName));
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

  async createMany(
    inputs: Array<{
      name: string;
      normalizedName: string;
      isDefault: boolean;
      createdByUserId: string | null;
    }>,
  ): Promise<SkillCatalogEntity[]> {
    for (const input of inputs) {
      const existing = await this.findByNormalizedName(input.normalizedName);
      if (!existing) {
        await this.create(input);
      }
    }

    return this.findManyByNormalizedNames(
      inputs.map((input) => input.normalizedName),
    );
  }

  seed(item: SkillCatalogEntity) {
    this.items.push(item);
  }
}
