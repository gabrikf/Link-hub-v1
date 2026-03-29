import { ResourceNotFoundError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export class GetPublicProfileUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private linksRepository: ILinksRepository,
  ) {}

  async execute(username: string) {
    const user = await this.usersRepository.findByLogin(username);

    if (!user) {
      throw new ResourceNotFoundError("User", username);
    }

    const links = await this.linksRepository.findPublicByUserId(user.id);

    return {
      username: user.login,
      name: user.name,
      description: user.description,
      userPhoto: user.avatarUrl,
      links,
    };
  }
}
