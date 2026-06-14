import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { reembedResumeForUser } from "../shared/reembed-resume-for-user.js";

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
    private resumesRepository?: IResumesRepository,
    private enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
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

    const updated = await this.workExperienceRepository.update(workExperience);

    if (this.resumesRepository && this.enqueueResumeEmbeddingUseCase) {
      await reembedResumeForUser(
        input.userId,
        this.resumesRepository,
        this.enqueueResumeEmbeddingUseCase,
      );
    }

    return updated;
  }
}
