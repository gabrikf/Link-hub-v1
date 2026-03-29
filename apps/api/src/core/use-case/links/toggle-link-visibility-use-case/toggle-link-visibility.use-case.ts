import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";

export class ToggleLinkVisibilityUseCase {
  constructor(private linksRepository: ILinksRepository) {}

  async execute(userId: string, linkId: string, isPublic: boolean) {
    if (typeof isPublic !== "boolean") {
      throw new BadRequestError("isPublic must be a boolean");
    }

    const link = await this.linksRepository.findById(linkId);

    if (!link) {
      throw new ResourceNotFoundError("Link", linkId);
    }

    if (link.userId !== userId) {
      throw new ForbiddenError("You do not have access to this link");
    }

    link.updateVisibility(isPublic);

    return this.linksRepository.update(link);
  }
}
