import {
  DEFAULT_BUILTIN_BLOCKS,
  DEFAULT_TAB_TITLE,
  GRID_COLUMNS,
  ProfileViewport,
} from "@repo/schemas";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";
import { IProfileBlocksRepository } from "../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../repositories/profile-tab/profile-tabs-repository.js";

export interface SeededLayout {
  tab: ProfileTabEntity;
  blocks: ProfileBlockEntity[];
}

/**
 * Pure factory: given an empty viewport, build the entities to persist — one
 * default tab plus the four built-in blocks (header pinned across tabs, the
 * rest stacked full-width inside the tab).
 */
export function seedDefaultLayout(
  userId: string,
  viewport: ProfileViewport,
): SeededLayout {
  const tab = ProfileTabEntity.create({
    userId,
    viewport,
    title: DEFAULT_TAB_TITLE,
    order: 0,
  });

  const gridW = GRID_COLUMNS[viewport];

  const blocks = DEFAULT_BUILTIN_BLOCKS.map((def) =>
    ProfileBlockEntity.create({
      userId,
      viewport,
      tabId: def.pinnedAllTabs ? null : tab.id,
      kind: def.kind,
      gridX: 0,
      gridY: def.gridY,
      gridW,
      gridH: def.gridH,
      isVisible: true,
      pinnedAllTabs: def.pinnedAllTabs,
      config: null,
    }),
  );

  return { tab, blocks };
}

/**
 * Returns the persisted tabs + blocks for a viewport, seeding the canonical
 * default layout on first access (when the viewport has no tabs yet). Shared by
 * the authenticated layout endpoint and the public profile.
 */
export async function ensureSeededViewport(
  tabsRepository: IProfileTabsRepository,
  blocksRepository: IProfileBlocksRepository,
  userId: string,
  viewport: ProfileViewport,
): Promise<{ tabs: ProfileTabEntity[]; blocks: ProfileBlockEntity[] }> {
  const existingTabs = await tabsRepository.findByUserAndViewport(
    userId,
    viewport,
  );

  if (existingTabs.length === 0) {
    const { tab, blocks } = seedDefaultLayout(userId, viewport);

    await tabsRepository.create(tab);
    for (const block of blocks) {
      await blocksRepository.create(block);
    }

    return { tabs: [tab], blocks };
  }

  const blocks = await blocksRepository.findByUserAndViewport(userId, viewport);
  return { tabs: existingTabs, blocks };
}
