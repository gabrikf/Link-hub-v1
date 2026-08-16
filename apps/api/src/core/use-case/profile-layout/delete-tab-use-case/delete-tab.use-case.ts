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

    // Delete ONLY this viewport's tab row — the other viewport owns its own
    // tabs and must not be touched.
    //
    // Its blocks are NOT deleted. A block's content (kind/config) is shared
    // with its counterpart row in the other viewport, so deleting the row here
    // would either destroy content the user still has on the other viewport or
    // leave the two viewports holding different sets of blocks. Instead the
    // blocks fall back to this viewport's default area — the first remaining
    // tab — where the user can see them and move them on. Only this viewport's
    // rows are re-homed; the other viewport's assignment is untouched.
    //
    // One transaction: re-home first, then drop the tab, so the schema's
    // ON DELETE CASCADE never has any row left to take with it.
    await this.unitOfWork.runInTransaction(async (tx) => {
      const fallbackTab = siblings.find((sibling) => sibling.id !== tab.id);
      const orphans = await this.blocksRepository.findByTabId(tab.id, tx);

      for (const block of orphans) {
        if (fallbackTab) {
          block.moveToTab(fallbackTab.id);
        } else {
          // Unreachable given the guard above, but a block with a dangling tab
          // renders nowhere — pinning it keeps it visible rather than lost.
          block.setPinned(true);
        }
        await this.blocksRepository.update(block, tx);
      }

      await this.tabsRepository.delete(tab.id, tx);
    });

    return { success: true };
  }
}
