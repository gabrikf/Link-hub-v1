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
 * Public layout: what an anonymous visitor is allowed to receive.
 *
 * Two filters, in this order:
 *
 * 1. `isVisible` — a hidden block is never public, in either mode.
 * 2. `tabsEnabled === false` → the tab strip is not rendered at all, so the
 *    public payload carries **`tabs: []` and pinned blocks only**
 *    (`pinnedAllTabs`). Filtering in the browser was not enough: the owner
 *    believes tab content is hidden while `curl /profile/:username` still
 *    returned every tab title and every tab block's text, image URLs, button
 *    URLs and post configs. Withholding it here is the only place that is true
 *    for every client.
 *
 * With `tabsEnabled === true` nothing changes: every tab, every visible block.
 *
 * This is deliberately NOT symmetric with {@link assembleLayout}. The owner's
 * editor must keep receiving every tab and every block with tabs off — it needs
 * them for the hidden-block warning, and stripping them there would make
 * turning tabs off look like it deleted the content. Owner sees everything;
 * the public sees only what is rendered.
 */
export function toPublicLayout(
  tabs: ProfileTabEntity[],
  blocks: ProfileBlockEntity[],
  tabsEnabled: boolean,
): ProfileLayout {
  const visibleBlocks = blocks.filter((block) => block.isVisible);

  if (!tabsEnabled) {
    return {
      tabs: [],
      blocks: visibleBlocks
        .filter((block) => block.pinnedAllTabs)
        .map(toBlockDTO),
      tabsEnabled,
    };
  }

  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  return {
    tabs: sortedTabs.map(toTabDTO),
    blocks: visibleBlocks.map(toBlockDTO),
    tabsEnabled,
  };
}
