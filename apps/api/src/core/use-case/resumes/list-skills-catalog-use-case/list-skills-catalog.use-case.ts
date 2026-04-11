import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";

export class ListSkillsCatalogUseCase {
  constructor(private skillCatalogRepository: ISkillCatalogRepository) {}

  async execute(userId: string) {
    return this.skillCatalogRepository.listForUser(userId);
  }
}
