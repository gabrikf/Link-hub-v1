import { ResourceNotFoundError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export class GetMeProfileUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private linksRepository: ILinksRepository,
  ) {}

  async execute(userId: string) {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new ResourceNotFoundError("User", userId);
    }

    const links = await this.linksRepository.findByUserId(userId);

    return {
      username: user.login,
      name: user.name,
      description: user.description,
      userPhoto: user.avatarUrl,
      links,
    };
  }
}
