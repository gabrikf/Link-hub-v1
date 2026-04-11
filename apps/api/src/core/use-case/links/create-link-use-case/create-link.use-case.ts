import { LinkEntity } from "../../../entity/link/link-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface ICreateLinkInput {
  userId: string;
  title: string;
  url: string;
  icon?: string | null;
  isPublic: boolean;
}

export class CreateLinkUseCase {
  constructor(
    private linksRepository: ILinksRepository,
    private usersRepository: IUsersRepository,
  ) {}

  async execute(input: ICreateLinkInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const lastOrder = await this.linksRepository.findLastOrderByUserId(
      input.userId,
    );

    const link = LinkEntity.create({
      userId: input.userId,
      title: input.title,
      url: input.url,
      icon: input.icon ?? null,
      isPublic: input.isPublic,
      order: lastOrder === null ? 0 : lastOrder + 1,
    });

    return this.linksRepository.create(link);
  }
}
