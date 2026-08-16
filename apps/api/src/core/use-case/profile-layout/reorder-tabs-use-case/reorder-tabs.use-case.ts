import { ReorderTabsInput } from "@repo/schemas";
import { BadRequestError, ForbiddenError } from "../../../errors/index.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";

export class ReorderTabsUseCase {
  constructor(private tabsRepository: IProfileTabsRepository) {}

  async execute(userId: string, input: ReorderTabsInput) {
    const { viewport, tabIds } = input;

    const existingTabs = await this.tabsRepository.findByUserAndViewport(
      userId,
      viewport,
    );
    const existingIds = new Set(existingTabs.map((tab) => tab.id));

    const hasForeignId = tabIds.some((tabId) => !existingIds.has(tabId));
    if (hasForeignId) {
      throw new ForbiddenError("Invalid tab IDs");
    }

    const uniqueIds = new Set(tabIds);
    if (uniqueIds.size !== tabIds.length) {
      throw new BadRequestError("tabIds must not contain duplicates");
    }

    if (tabIds.length !== existingTabs.length) {
      throw new BadRequestError(
        "tabIds must include every tab of the viewport",
      );
    }

    // Only this viewport's tabs move. The other viewport has its own tab list
    // with its own order, and reordering here must not disturb it.
    await this.tabsRepository.reorder(userId, viewport, tabIds);

    return { success: true };
  }
}
