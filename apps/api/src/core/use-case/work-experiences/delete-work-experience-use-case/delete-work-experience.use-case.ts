import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IWorkExperienceRepository } from "../../../repositories/work-experience/work-experience-repository.js";
import { EnqueueResumeEmbeddingUseCase } from "../../resumes/enqueue-resume-embedding-use-case/enqueue-resume-embedding.use-case.js";
import { reembedResumeForUser } from "../shared/reembed-resume-for-user.js";

export interface IDeleteWorkExperienceInput {
  userId: string;
  workExperienceId: string;
}

export class DeleteWorkExperienceUseCase {
  constructor(
    private workExperienceRepository: IWorkExperienceRepository,
    private resumesRepository?: IResumesRepository,
    private enqueueResumeEmbeddingUseCase?: EnqueueResumeEmbeddingUseCase,
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

    if (this.resumesRepository && this.enqueueResumeEmbeddingUseCase) {
      await reembedResumeForUser(
        input.userId,
        this.resumesRepository,
        this.enqueueResumeEmbeddingUseCase,
      );
    }
  }
}
