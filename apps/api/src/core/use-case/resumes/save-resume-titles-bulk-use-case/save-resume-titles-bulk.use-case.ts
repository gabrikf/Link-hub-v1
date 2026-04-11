import {
  BadRequestError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IResumesRepository } from "../../../repositories/resume/resume-repository.js";
import { IResumeTitleRepository } from "../../../repositories/resume-title/resume-title-repository.js";
import { ITitleCatalogRepository } from "../../../repositories/title-catalog/title-catalog-repository.js";

export interface ISaveResumeTitlesBulkInput {
  userId: string;
  items: Array<{
    titleId: string;
    isPrimary?: boolean;
  }>;
}

export class SaveResumeTitlesBulkUseCase {
  constructor(
    private resumesRepository: IResumesRepository,
    private titleCatalogRepository: ITitleCatalogRepository,
    private resumeTitleRepository: IResumeTitleRepository,
  ) {}

  async execute(input: ISaveResumeTitlesBulkInput) {
    const resume = await this.resumesRepository.findByUserId(input.userId);

    if (!resume) {
      throw new ResourceNotFoundError("Resume", input.userId);
    }

    const primaryCount = input.items.filter(
      (item) => item.isPrimary === true,
    ).length;

    if (primaryCount > 1) {
      throw new BadRequestError("Only one primary title is allowed");
    }

    await Promise.all(
      input.items.map(async (item) => {
        const title = await this.titleCatalogRepository.findById(item.titleId);

        if (!title) {
          throw new ResourceNotFoundError("Title", item.titleId);
        }
      }),
    );

    await this.resumeTitleRepository.replaceForResume(
      resume.id,
      input.items.map((item) => ({
        titleId: item.titleId,
        isPrimary: item.isPrimary ?? false,
      })),
    );

    return this.resumeTitleRepository.listByResumeId(resume.id);
  }
}
