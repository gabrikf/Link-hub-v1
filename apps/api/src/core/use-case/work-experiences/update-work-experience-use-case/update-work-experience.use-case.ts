import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

export interface IUpdateWorkExperienceInput {
  userId: string;
  workExperienceId: string;
  title?: string;
  companyName?: string;
  employmentType?: string | null;
  workModel?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  locationCountry?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string | null;
  mainStack?: string[];
}

export class UpdateWorkExperienceUseCase {
  constructor(
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(input: IUpdateWorkExperienceInput) {
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
        "You can only edit your own work experiences",
      );
    }

    workExperience.updateContent({
      title: input.title,
      companyName: input.companyName,
      employmentType: input.employmentType,
      workModel: input.workModel,
      locationCity: input.locationCity,
      locationState: input.locationState,
      locationCountry: input.locationCountry,
      startDate: input.startDate,
      endDate: input.endDate,
      isCurrent: input.isCurrent,
      description: input.description,
      mainStack: input.mainStack,
    });

    return this.workExperienceRepository.update(workExperience);
  }
}
