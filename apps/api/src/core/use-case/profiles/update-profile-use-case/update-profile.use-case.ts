import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface IUpdateProfileInput {
  userId: string;
  username: string;
  name?: string;
  description?: string | null;
}

export class UpdateProfileUseCase {
  constructor(private usersRepository: IUsersRepository) {}

  async execute(input: IUpdateProfileInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    if (input.username !== user.login) {
      const userWithSameLogin = await this.usersRepository.findByLogin(
        input.username,
      );

      if (userWithSameLogin) {
        throw new DuplicateResourceError("User", "login", input.username);
      }
    }

    user.login = input.username;

    if (typeof input.name === "string") {
      user.name = input.name;
    }

    if (typeof input.description !== "undefined") {
      user.updateDescription(input.description ?? null);
    }

    user.updateTimestamp();

    const updatedUser = await this.usersRepository.update(user);

    return {
      id: updatedUser.id,
      username: updatedUser.login,
      name: updatedUser.name,
      description: updatedUser.description,
      userPhoto: updatedUser.avatarUrl,
      email: updatedUser.email,
    };
  }
}
