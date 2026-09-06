import {
  CUSTOM_BLOCK_KINDS,
  customBlockConfigSchemaByKind,
  CustomBlockKind,
  ProfileBlock,
  UpdateBlockInput,
} from "@repo/schemas";
import {
  BadRequestError,
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { ProfileBlockEntity } from "../../../entity/profile-block/profile-block-entity.js";
import { IUnitOfWork } from "../../../providers/unit-of-work/unit-of-work.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toBlockDTO } from "../assemble-layout.js";

/**
 * How the EDITED row's tab association should change. Unlike config and
 * visibility this is never mirrored: tabs belong to a single viewport, so a
 * block's tab (and whether it is pinned) is a per-viewport property.
 */
type TabChange =
  | { type: "none" }
  | { type: "pin" }
  | { type: "unpin"; tabId: string | null }
  | { type: "move"; tabId: string };

export class UpdateBlockUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
    private unitOfWork: IUnitOfWork,
  ) {}

  async execute(
    userId: string,
    blockId: string,
    input: UpdateBlockInput,
  ): Promise<ProfileBlock> {
    const block = await this.blocksRepository.findById(blockId);

    if (!block) {
      throw new ResourceNotFoundError("ProfileBlock", blockId);
    }

    if (block.userId !== userId) {
      throw new ForbiddenError("You do not own this block");
    }

    // Validate the config once against the (shared) block kind.
    let configData: unknown;
    if (input.config !== undefined) {
      if (!CUSTOM_BLOCK_KINDS.includes(block.kind as CustomBlockKind)) {
        throw new BadRequestError("This block kind does not accept a config");
      }

      const configSchema =
        customBlockConfigSchemaByKind[block.kind as CustomBlockKind];
      const configResult = configSchema.safeParse(input.config);
      if (!configResult.success) {
        throw new BadRequestError("Invalid block config for this block");
      }

      configData = configResult.data;
    }

    // Resolve the tab-association change against the block's OWN viewport. A
    // tab id from the other viewport is rejected here rather than silently
    // anchoring the block to a tab its layout does not contain.
    const tabChange = await this.resolveTabChange(userId, block, input);

    // Content changes (config, visibility) apply to ALL rows sharing this
    // block's logical identity — across both viewports — in ONE transaction so
    // a mid-loop failure can't leave the pc and mobile rows with divergent
    // content. Positions (gridX/Y/W/H) and the tab association stay per-viewport
    // and are only ever written for the row being edited.
    const currentRow = await this.unitOfWork.runInTransaction(async (tx) => {
      const groupRows = await this.blocksRepository.findByGroupId(
        userId,
        block.groupId,
        tx,
      );

      let current: ProfileBlockEntity = block;

      for (const row of groupRows) {
        this.applyRowUpdate(row, blockId, configData, input, tabChange);

        const updated = await this.blocksRepository.update(row, tx);
        if (updated.id === blockId) {
          current = updated;
        }
      }

      return current;
    });

    return toBlockDTO(currentRow);
  }

  /**
   * Applies the content changes (config, visibility) shared across every row
   * in the group, plus the tab-association change — but only to the row
   * actually being edited. Extracted out of the `runInTransaction` callback
   * in `execute` purely to keep that callback's cognitive complexity down;
   * behaviour is unchanged.
   */
  private applyRowUpdate(
    row: ProfileBlockEntity,
    blockId: string,
    configData: unknown,
    input: UpdateBlockInput,
    tabChange: TabChange,
  ): void {
    if (configData !== undefined) {
      row.updateConfig(configData);
    }

    if (input.isVisible !== undefined) {
      row.setVisibility(input.isVisible);
    }

    if (row.id !== blockId) {
      return;
    }

    this.applyTabChange(row, tabChange);
  }

  private applyTabChange(row: ProfileBlockEntity, tabChange: TabChange): void {
    if (tabChange.type === "pin") {
      row.setPinned(true);
      return;
    }

    if (tabChange.type === "unpin") {
      // No tab to unpin into (viewport has none) — staying pinned keeps
      // the block visible instead of anchoring it nowhere.
      if (tabChange.tabId === null) {
        row.setPinned(true);
      } else {
        row.setPinned(false, tabChange.tabId);
      }
      return;
    }

    if (tabChange.type === "move") {
      row.moveToTab(tabChange.tabId);
    }
  }

  private async resolveTabChange(
    userId: string,
    block: ProfileBlockEntity,
    input: UpdateBlockInput,
  ): Promise<TabChange> {
    if (input.pinnedAllTabs !== undefined) {
      if (input.pinnedAllTabs) {
        return { type: "pin" };
      }
      const tabId = await this.resolveTargetTab(
        userId,
        block,
        input.tabId ?? null,
      );
      return { type: "unpin", tabId };
    }

    if (input.tabId !== undefined) {
      if (input.tabId === null) {
        return { type: "pin" };
      }
      const tabId = await this.resolveTargetTab(userId, block, input.tabId);
      if (tabId === null) {
        throw new BadRequestError("Target tab does not exist");
      }
      return { type: "move", tabId };
    }

    return { type: "none" };
  }

  /**
   * Resolve a requested tab id within the block's own viewport. A null request
   * falls back to the first tab of that viewport.
   */
  private async resolveTargetTab(
    userId: string,
    block: ProfileBlockEntity,
    requestedTabId: string | null,
  ): Promise<string | null> {
    const tabs = await this.tabsRepository.findByUserAndViewport(
      userId,
      block.viewport,
    );

    if (requestedTabId) {
      const target = tabs.find((tab) => tab.id === requestedTabId);
      if (!target) {
        throw new BadRequestError("Target tab does not exist");
      }
      return target.id;
    }

    return tabs[0]?.id ?? null;
  }
}
