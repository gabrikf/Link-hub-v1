import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface ICreateCustomTitleInput {
  userId: string;
  name: string;
}

export class CreateCustomTitleUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private titleCatalogRepository: ITitleCatalogRepository,
  ) {}

  async execute(input: ICreateCustomTitleInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const normalizedName = normalizeCatalogName(input.name);
    const existing =
      await this.titleCatalogRepository.findByNormalizedName(normalizedName);

    if (existing) {
      throw new DuplicateResourceError("Title", "name", input.name);
    }

    return this.titleCatalogRepository.create({
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
