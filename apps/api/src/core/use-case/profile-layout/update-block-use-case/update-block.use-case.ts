import {
  CUSTOM_BLOCK_KINDS,
  customBlockConfigSchemaByKind,
  CustomBlockKind,
  ProfileBlock,
  ProfileViewport,
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

/** How a block's tab association should change (mirrored across viewports). */
type TabChange =
  | { type: "none" }
  | { type: "pin" }
  | { type: "unpin"; tabGroupId: string | null }
  | { type: "move"; tabGroupId: string };

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
    let configData: unknown | undefined;
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

    // Resolve the tab-association change once, against the current viewport, as
    // a groupId so it can be re-resolved per viewport below.
    const tabChange = await this.resolveTabChange(userId, block.viewport, input);

    // Apply every shared-field change (config, visibility, pin/tab association)
    // to ALL rows sharing this block's logical identity — across both
    // viewports — in ONE transaction so a mid-loop failure can't leave the pc
    // and mobile rows with divergent config/visibility/tab association.
    // Positions (gridX/Y/W/H) are intentionally left untouched: they stay
    // per-viewport and are only mutated by update-block-positions.
    const currentRow = await this.unitOfWork.runInTransaction(async (tx) => {
      const groupRows = await this.blocksRepository.findByGroupId(
        userId,
        block.groupId,
        tx,
      );

      const tabsByViewport = new Map<
        ProfileViewport,
        Awaited<ReturnType<IProfileTabsRepository["findByUserAndViewport"]>>
      >();
      const resolveTabId = async (
        viewport: ProfileViewport,
        tabGroupId: string | null,
      ): Promise<string | null> => {
        if (tabGroupId === null) {
          return null;
        }
        let tabs = tabsByViewport.get(viewport);
        if (!tabs) {
          tabs = await this.tabsRepository.findByUserAndViewport(
            userId,
            viewport,
            tx,
          );
          tabsByViewport.set(viewport, tabs);
        }
        return tabs.find((tab) => tab.groupId === tabGroupId)?.id ?? null;
      };

      let current: ProfileBlockEntity = block;

      for (const row of groupRows) {
        if (configData !== undefined) {
          row.updateConfig(configData);
        }

        if (input.isVisible !== undefined) {
          row.setVisibility(input.isVisible);
        }

        if (tabChange.type === "pin") {
          row.setPinned(true);
        } else if (tabChange.type === "unpin") {
          const tabId = await resolveTabId(row.viewport, tabChange.tabGroupId);
          row.setPinned(false, tabId);
        } else if (tabChange.type === "move") {
          const tabId = await resolveTabId(row.viewport, tabChange.tabGroupId);
          if (tabId === null) {
            // The target tab group is missing in this viewport (legacy skew) —
            // pin rather than silently anchoring to a non-existent tab.
            row.setPinned(true);
          } else {
            row.moveToTab(tabId);
          }
        }

        const updated = await this.blocksRepository.update(row, tx);
        if (updated.id === blockId) {
          current = updated;
        }
      }

      return current;
    });

    return toBlockDTO(currentRow);
  }

  private async resolveTabChange(
    userId: string,
    viewport: ProfileViewport,
    input: UpdateBlockInput,
  ): Promise<TabChange> {
    if (input.pinnedAllTabs !== undefined) {
      if (input.pinnedAllTabs) {
        return { type: "pin" };
      }
      const tabGroupId = await this.resolveTargetTabGroup(
        userId,
        viewport,
        input.tabId ?? null,
      );
      return { type: "unpin", tabGroupId };
    }

    if (input.tabId !== undefined) {
      if (input.tabId === null) {
        return { type: "pin" };
      }
      const tabGroupId = await this.resolveTargetTabGroup(
        userId,
        viewport,
        input.tabId,
      );
      if (tabGroupId === null) {
        throw new BadRequestError("Target tab does not exist");
      }
      return { type: "move", tabGroupId };
    }

    return { type: "none" };
  }

  /**
   * Resolve a requested tab id (in the current viewport) to its shared groupId.
   * A null request falls back to the first tab of the viewport.
   */
  private async resolveTargetTabGroup(
    userId: string,
    viewport: ProfileViewport,
    requestedTabId: string | null,
  ): Promise<string | null> {
    const tabs = await this.tabsRepository.findByUserAndViewport(
      userId,
      viewport,
    );

    if (requestedTabId) {
      const target = tabs.find((tab) => tab.id === requestedTabId);
      if (!target) {
        throw new BadRequestError("Target tab does not exist");
      }
      return target.groupId;
    }

    return tabs[0]?.groupId ?? null;
  }
}
