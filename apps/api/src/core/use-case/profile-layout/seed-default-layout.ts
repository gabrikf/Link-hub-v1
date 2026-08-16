import {
  DEFAULT_BUILTIN_BLOCKS,
  DEFAULT_TAB_TITLE,
  GRID_COLUMNS,
  ProfileViewport,
} from "@repo/schemas";
import { ProfileBlockEntity } from "../../entity/profile-block/profile-block-entity.js";
import { ProfileTabEntity } from "../../entity/profile-tab/profile-tab-entity.js";
import {
  IUnitOfWork,
  TransactionContext,
} from "../../providers/unit-of-work/unit-of-work.js";
import { IProfileBlocksRepository } from "../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../repositories/profile-tab/profile-tabs-repository.js";

/** The two viewports a logical block is mirrored across. (Tabs are not mirrored.) */
export const VIEWPORTS: ProfileViewport[] = ["pc", "mobile"];

export interface SeededViewport {
  tab: ProfileTabEntity;
  blocks: ProfileBlockEntity[];
}

export interface SeededLayout {
  pc: SeededViewport;
  mobile: SeededViewport;
}

/**
 * Pure factory: build the entities to persist for BOTH viewports at once — one
 * default tab per viewport plus the blocks in {@link DEFAULT_BUILTIN_BLOCKS}
 * (header pinned across tabs, the rest stacked full-width inside the tab).
 *
 * Each viewport gets its OWN tab — the two are independent from the start.
 * Blocks still pair up across viewports through a shared `groupId` (so content
 * is authored once), but each row anchors to the tab of its own viewport and
 * carries its own grid width.
 *
 * Note this only affects accounts seeded from now on. Existing users already
 * have a persisted layout, so the empty-check below short-circuits and they will
 * NOT retroactively receive newly-added default blocks — they have to add them
 * from the layout editor.
 */
export function seedDefaultLayout(userId: string): SeededLayout {
  // One shared groupId per built-in block, reused across both viewports.
  const blockGroupIds = DEFAULT_BUILTIN_BLOCKS.map(() => crypto.randomUUID());

  const buildViewport = (viewport: ProfileViewport): SeededViewport => {
    const tab = ProfileTabEntity.create({
      userId,
      viewport,
      title: DEFAULT_TAB_TITLE,
      order: 0,
    });

    const gridW = GRID_COLUMNS[viewport];

    const blocks = DEFAULT_BUILTIN_BLOCKS.map((def, index) =>
      ProfileBlockEntity.create({
        userId,
        groupId: blockGroupIds[index]!,
        viewport,
        tabId: def.pinnedAllTabs ? null : tab.id,
        kind: def.kind,
        gridX: 0,
        gridY: def.gridY,
        gridW,
        gridH: def.gridH,
        isVisible: true,
        pinnedAllTabs: def.pinnedAllTabs,
        // Built-ins take no config; seeded custom kinds (posts) bring their own.
        config: def.config ?? null,
      }),
    );

    return { tab, blocks };
  };

  return {
    pc: buildViewport("pc"),
    mobile: buildViewport("mobile"),
  };
}

async function persistViewport(
  tabsRepository: IProfileTabsRepository,
  blocksRepository: IProfileBlocksRepository,
  seeded: SeededViewport,
  tx: TransactionContext,
): Promise<void> {
  await tabsRepository.create(seeded.tab, tx);
  for (const block of seeded.blocks) {
    await blocksRepository.create(block, tx);
  }
}

/**
 * Returns the persisted tabs + blocks for a viewport, seeding the canonical
 * default layout on first access. Seeding writes BOTH viewports together
 * whenever the requested one is empty — not because their tabs are linked (they
 * are not) but so a block created in one viewport always has a counterpart row,
 * and its tab, waiting in the other. Shared by the authenticated layout endpoint
 * and the block-creation flow.
 *
 * Concurrency: a cheap unlocked empty-check serves the common (already-seeded)
 * case. On first access it seeds inside a single transaction guarded by a
 * per-user advisory lock (see {@link IUnitOfWork.lockForUserSeed}). Concurrent
 * first-accesses (React double-mount, prefetch, two tabs, a GET racing a
 * create) all pass the unlocked check, but the lock serializes them: the first
 * seeds and commits; the rest re-check UNDER the lock, find the seeded rows and
 * return them — so no duplicate tabs/blocks are ever written.
 */
export async function ensureSeededViewport(
  tabsRepository: IProfileTabsRepository,
  blocksRepository: IProfileBlocksRepository,
  unitOfWork: IUnitOfWork,
  userId: string,
  viewport: ProfileViewport,
): Promise<{ tabs: ProfileTabEntity[]; blocks: ProfileBlockEntity[] }> {
  const existingTabs = await tabsRepository.findByUserAndViewport(
    userId,
    viewport,
  );

  if (existingTabs.length > 0) {
    const blocks = await blocksRepository.findByUserAndViewport(
      userId,
      viewport,
    );
    return { tabs: existingTabs, blocks };
  }

  return unitOfWork.runInTransaction(async (tx) => {
    // Serialize concurrent first-access seeders for this user; the lock is held
    // until this transaction commits/rolls back.
    await unitOfWork.lockForUserSeed(userId, tx);

    // Re-check emptiness under the lock: a racing seeder may have committed
    // between the unlocked check above and us acquiring the lock.
    const tabsUnderLock = await tabsRepository.findByUserAndViewport(
      userId,
      viewport,
      tx,
    );
    if (tabsUnderLock.length > 0) {
      const blocks = await blocksRepository.findByUserAndViewport(
        userId,
        viewport,
        tx,
      );
      return { tabs: tabsUnderLock, blocks };
    }

    const seeded = seedDefaultLayout(userId);
    const otherViewport: ProfileViewport = viewport === "pc" ? "mobile" : "pc";

    // Persist the requested viewport, and seed the other viewport too so both
    // have a default tab to anchor blocks to. Only seed the other viewport if it
    // is also empty (a legacy account may already have it configured, in which
    // case we leave it untouched rather than duplicating rows).
    const otherExisting = await tabsRepository.findByUserAndViewport(
      userId,
      otherViewport,
      tx,
    );

    await persistViewport(
      tabsRepository,
      blocksRepository,
      seeded[viewport],
      tx,
    );
    if (otherExisting.length === 0) {
      await persistViewport(
        tabsRepository,
        blocksRepository,
        seeded[otherViewport],
        tx,
      );
    }

    return { tabs: [seeded[viewport].tab], blocks: seeded[viewport].blocks };
  });
}
