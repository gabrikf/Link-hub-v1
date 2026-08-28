import { ProfileBlock, ProfileLayout, ProfileTab } from "@repo/schemas";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";

export function toTabDTO(tab: ProfileTabEntity): ProfileTab {
  return {
    id: tab.id,
    title: tab.title,
    order: tab.order,
  };
}

export function toBlockDTO(block: ProfileBlockEntity): ProfileBlock {
  return {
    id: block.id,
    groupId: block.groupId,
    kind: block.kind,
    tabId: block.tabId,
    gridX: block.gridX,
    gridY: block.gridY,
    gridW: block.gridW,
    gridH: block.gridH,
    isVisible: block.isVisible,
    pinnedAllTabs: block.pinnedAllTabs,
    config: block.config ?? null,
  };
}

/**
 * Full layout (includes hidden blocks) for the authenticated editor.
 *
 * `tabsEnabled` is passed in rather than derived: it belongs to the USER row,
 * per viewport, and the caller is the only one holding it. Making it a required
 * parameter is deliberate — a default would let a caller quietly ship `true` to
 * someone who had turned tabs off.
 */
export function assembleLayout(
  tabs: ProfileTabEntity[],
  blocks: ProfileBlockEntity[],
  tabsEnabled: boolean,
): ProfileLayout {
  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  return {
    tabs: sortedTabs.map(toTabDTO),
    blocks: blocks.map(toBlockDTO),
    tabsEnabled,
  };
}

/**
 * Public layout: only visible blocks survive — pinned blocks (tabId null) plus
 * per-tab blocks. Same shape as {@link assembleLayout} but visible-only.
 */
export function toPublicLayout(
  tabs: ProfileTabEntity[],
  blocks: ProfileBlockEntity[],
  tabsEnabled: boolean,
): ProfileLayout {
  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);
  const visibleBlocks = blocks.filter((block) => block.isVisible);

  return {
    tabs: sortedTabs.map(toTabDTO),
    blocks: visibleBlocks.map(toBlockDTO),
    tabsEnabled,
  };
}
