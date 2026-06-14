import { ResourceNotFoundError } from "../../../errors/index.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

export class GetPublicWorkExperiencesByUsernameUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(username: string) {
    const user = await this.usersRepository.findByLogin(username);

    if (!user) {
      throw new ResourceNotFoundError("User", username);
    }

    return this.workExperienceRepository.findByUserId(user.id);
  }
}
