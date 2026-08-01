import { TitleCatalogEntity } from "../../entity/title-catalog/title-catalog-entity.js";
import { ITitleCatalogRepository } from "./title-catalog-repository.js";

export class InMemoryTitleCatalogRepository implements ITitleCatalogRepository {
  private items: TitleCatalogEntity[] = [];

  async findById(id: string): Promise<TitleCatalogEntity | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<TitleCatalogEntity | null> {
    return (
      this.items.find((item) => item.normalizedName === normalizedName) ?? null
    );
  }

  async findManyByNormalizedNames(
    normalizedNames: string[],
  ): Promise<TitleCatalogEntity[]> {
    const wanted = new Set(normalizedNames);
    return this.items.filter((item) => wanted.has(item.normalizedName));
  }

  async listForUser(userId: string): Promise<TitleCatalogEntity[]> {
    return this.items.filter(
      (item) => item.isDefault || item.createdByUserId === userId,
    );
  }

  async create(input: {
    name: string;
    normalizedName: string;
    isDefault: boolean;
    createdByUserId: string | null;
  }): Promise<TitleCatalogEntity> {
    const created = TitleCatalogEntity.create({
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
  ): Promise<TitleCatalogEntity[]> {
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

  seed(item: TitleCatalogEntity) {
    this.items.push(item);
  }
}
