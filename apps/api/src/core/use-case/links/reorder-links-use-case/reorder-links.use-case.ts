import { BadRequestError, ForbiddenError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";

export class ReorderLinksUseCase {
  constructor(private linksRepository: ILinksRepository) {}

  async execute(userId: string, linkIds: string[]) {
    if (!Array.isArray(linkIds) || linkIds.length === 0) {
      throw new BadRequestError("linkIds must be a non-empty array");
    }

    const existingLinks = await this.linksRepository.findByUserId(userId);
    const existingIds = new Set(existingLinks.map((link) => link.id));

    const hasInvalidId = linkIds.some((linkId) => !existingIds.has(linkId));
    if (hasInvalidId) {
      throw new ForbiddenError("Invalid link IDs");
    }

    await this.linksRepository.reorderByIds(userId, linkIds);

    return { success: true };
  }
}
