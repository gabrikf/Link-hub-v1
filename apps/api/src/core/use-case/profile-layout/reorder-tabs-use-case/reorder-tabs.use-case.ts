import { ReorderTabsInput } from "@repo/schemas";
import { BadRequestError, ForbiddenError } from "../../../errors/index.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { VIEWPORTS } from "../seed-default-layout.js";

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

    // Translate the requested viewport order into a groupId order, then apply
    // that same logical order to EVERY viewport so tabs stay mirrored.
    const groupById = new Map(existingTabs.map((tab) => [tab.id, tab.groupId]));
    const groupOrder = tabIds.map((tabId) => groupById.get(tabId)!);

    for (const targetViewport of VIEWPORTS) {
      const viewportTabs = await this.tabsRepository.findByUserAndViewport(
        userId,
        targetViewport,
      );
      const idByGroup = new Map(
        viewportTabs.map((tab) => [tab.groupId, tab.id]),
      );

      const orderedIds = groupOrder
        .map((groupId) => idByGroup.get(groupId))
        .filter((id): id is string => typeof id === "string");

      // Append any tabs that exist ONLY in this viewport (no counterpart in the
      // requested group order) deterministically — by their current order, then
      // id — instead of dropping them from the reorder and leaving them with a
      // stale/duplicate order value. This keeps every viewport's orders unique
      // and consistent even when the two viewports have drifted out of sync.
      const placed = new Set(orderedIds);
      const leftovers = viewportTabs
        .filter((tab) => !placed.has(tab.id))
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        .map((tab) => tab.id);

      await this.tabsRepository.reorder(userId, targetViewport, [
        ...orderedIds,
        ...leftovers,
      ]);
    }

    return { success: true };
  }
}
