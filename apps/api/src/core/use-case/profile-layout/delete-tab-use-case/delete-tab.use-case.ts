import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IUnitOfWork } from "../../../providers/unit-of-work/unit-of-work.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";

export class DeleteTabUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
    private unitOfWork: IUnitOfWork,
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

    // Delete the logical tab across BOTH viewports (all rows sharing its
    // groupId) plus the blocks anchored to each of those viewport tab rows — in
    // one transaction so a mid-delete failure can't drop the tab in one
    // viewport while leaving it (or its blocks) in the other. Note this only
    // removes per-tab blocks (deleteByTabId); blocks pinned across all tabs
    // (tabId null) are intentionally preserved.
    await this.unitOfWork.runInTransaction(async (tx) => {
      const groupTabs = await this.tabsRepository.findByGroupId(
        userId,
        tab.groupId,
        tx,
      );

      for (const groupTab of groupTabs) {
        await this.blocksRepository.deleteByTabId(groupTab.id, tx);
      }

      await this.tabsRepository.deleteByGroupId(tab.groupId, tx);
    });

    return { success: true };
  }
}
