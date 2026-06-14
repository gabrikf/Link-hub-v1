import { ResourceNotFoundError } from "../../../errors/index.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";

export interface ICreateWorkExperienceInput {
  userId: string;
  title: string;
  companyName: string;
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

export class CreateWorkExperienceUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private workExperienceRepository: IWorkExperienceRepository,
  ) {}

  async execute(input: ICreateWorkExperienceInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const lastOrder =
      await this.workExperienceRepository.findLastOrderByUserId(input.userId);

    const isCurrent = input.isCurrent ?? false;

    const workExperience = WorkExperienceEntity.create({
      userId: input.userId,
      title: input.title,
      companyName: input.companyName,
      employmentType: input.employmentType ?? null,
      workModel: input.workModel ?? null,
      locationCity: input.locationCity ?? null,
      locationState: input.locationState ?? null,
      locationCountry: input.locationCountry ?? null,
      startDate: input.startDate ?? null,
      endDate: isCurrent ? null : (input.endDate ?? null),
      isCurrent,
      description: input.description ?? null,
      mainStack: input.mainStack ?? [],
      displayOrder: lastOrder === null ? 0 : lastOrder + 1,
    });

    return this.workExperienceRepository.create(workExperience);
  }
}
