import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";

export class ListTitlesCatalogUseCase {
  constructor(private titleCatalogRepository: ITitleCatalogRepository) {}

  async execute(userId: string) {
    return this.titleCatalogRepository.listForUser(userId);
  }
}
