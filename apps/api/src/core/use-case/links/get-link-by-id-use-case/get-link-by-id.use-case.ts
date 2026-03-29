import { ForbiddenError, ResourceNotFoundError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";

export class GetLinkByIdUseCase {
  constructor(private linksRepository: ILinksRepository) {}

  async execute(userId: string, linkId: string) {
    const link = await this.linksRepository.findById(linkId);

    if (!link) {
      throw new ResourceNotFoundError("Link", linkId);
    }

    if (link.userId !== userId) {
      throw new ForbiddenError("You do not have access to this link");
    }

    return link;
  }
}
