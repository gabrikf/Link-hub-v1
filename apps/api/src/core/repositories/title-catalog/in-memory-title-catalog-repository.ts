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

  seed(item: TitleCatalogEntity) {
    this.items.push(item);
  }
}
