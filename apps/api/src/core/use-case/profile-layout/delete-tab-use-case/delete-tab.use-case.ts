import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";

export class DeleteTabUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
  ) {}

  async execute(userId: string, tabId: string) {
    const tab = await this.tabsRepository.findById(tabId);

    if (!tab) {
      throw new ResourceNotFoundError("ProfileTab", tabId);
    }

    if (tab.userId !== userId) {
      throw new ForbiddenError("You do not own this tab");
    }

    const siblings = await this.tabsRepository.findByUserAndViewport(
      userId,
      tab.viewport,
    );

    if (siblings.length <= 1) {
      throw new BadRequestError(
        "Cannot delete the last remaining tab of a viewport",
      );
    }

    await this.blocksRepository.deleteByTabId(tabId);
    await this.tabsRepository.delete(tabId);

    return { success: true };
  }
}
