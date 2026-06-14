import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

export interface IDeleteWorkExperienceInput {
  userId: string;
  workExperienceId: string;
}

export class DeleteWorkExperienceUseCase {
  constructor(
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(input: IDeleteWorkExperienceInput) {
    const workExperience = await this.workExperienceRepository.findById(
      input.workExperienceId,
    );

    if (!workExperience) {
      throw new ResourceNotFoundError(
        "Work experience",
        input.workExperienceId,
      );
    }

    if (workExperience.userId !== input.userId) {
      throw new ForbiddenError(
        "You can only delete your own work experiences",
      );
    }

    await this.workExperienceRepository.delete(input.workExperienceId);
  }
}
