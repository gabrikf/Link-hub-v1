import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";
import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";

export interface IAddTitleToResumeInput {
  userId: string;
  titleId: string;
  isPrimary?: boolean;
}

export class AddTitleToResumeUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private titleCatalogRepository: ITitleCatalogRepository,
    private resumeTitleRepository: IResumeTitleRepository,
  ) {}

  async execute(input: IAddTitleToResumeInput) {
    const resume = await this.resumesRepository.findByUserId(input.userId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", input.userId);
    }

    const title = await this.titleCatalogRepository.findById(input.titleId);

    if (!title) {
      throw new ResourceNotFoundError("Title", input.titleId);
    }

    const alreadyAdded = await this.resumeTitleRepository.exists(
      resume.id,
      input.titleId,
    );

    if (alreadyAdded) {
      throw new DuplicateResourceError(
        "Resume title",
        "titleId",
        input.titleId,
      );
    }

    const isPrimary = input.isPrimary ?? false;

    if (isPrimary) {
      await this.resumeTitleRepository.clearPrimary(resume.id);
    }

    const lastOrder = await this.resumeTitleRepository.findLastOrderByResumeId(
      resume.id,
    );

    return this.resumeTitleRepository.create({
      resumeId: resume.id,
      titleId: input.titleId,
      isPrimary,
      displayOrder: lastOrder === null ? 0 : lastOrder + 1,
    });
  }
}
