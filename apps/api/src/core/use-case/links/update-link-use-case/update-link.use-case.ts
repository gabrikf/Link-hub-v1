import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";

export interface IUpdateLinkInput {
  userId: string;
  linkId: string;
  title: string;
  url: string;
  icon?: string | null;
  isPublic: boolean;
}

export class UpdateLinkUseCase {
  constructor(private linksRepository: ILinksRepository) {}

  async execute(input: IUpdateLinkInput) {
    const link = await this.linksRepository.findById(input.linkId);

    if (!link) {
      throw new ResourceNotFoundError("Link", input.linkId);
    }

    if (link.userId !== input.userId) {
      throw new ForbiddenError("You do not have access to this link");
    }

    link.updateContent({
      title: input.title,
      url: input.url,
      icon: input.icon ?? null,
      isPublic: input.isPublic,
    });

    return this.linksRepository.update(link);
  }
}
