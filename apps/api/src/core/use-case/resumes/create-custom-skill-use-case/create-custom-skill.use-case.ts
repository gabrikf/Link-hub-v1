import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { ISkillCatalogRepository } from "../../../repositories/skill-catalog/skill-catalog-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface ICreateCustomSkillInput {
  userId: string;
  name: string;
}

export class CreateCustomSkillUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private skillCatalogRepository: ISkillCatalogRepository,
  ) {}

  async execute(input: ICreateCustomSkillInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const normalizedName = normalizeCatalogName(input.name);
    const existing =
      await this.skillCatalogRepository.findByNormalizedName(normalizedName);

    if (existing) {
      throw new DuplicateResourceError("Skill", "name", input.name);
    }

    return this.skillCatalogRepository.create({
      name: input.name.trim(),
      normalizedName,
      isDefault: false,
      createdByUserId: input.userId,
    });
  }
}

function normalizeCatalogName(value: string) {
  return value.trim().toLowerCase();
}
