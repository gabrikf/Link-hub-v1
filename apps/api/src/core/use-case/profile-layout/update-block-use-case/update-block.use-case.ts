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
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toBlockDTO } from "../assemble-layout.js";

export class UpdateBlockUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
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

      block.updateConfig(configResult.data);
    }

    if (input.isVisible !== undefined) {
      block.setVisibility(input.isVisible);
    }

    if (input.pinnedAllTabs !== undefined) {
      if (input.pinnedAllTabs) {
        block.setPinned(true);
      } else {
        const targetTabId = await this.resolveTargetTab(
          userId,
          block.viewport,
          input.tabId ?? null,
        );
        block.setPinned(false, targetTabId);
      }
    } else if (input.tabId !== undefined) {
      if (input.tabId === null) {
        block.setPinned(true);
      } else {
        const targetTabId = await this.resolveTargetTab(
          userId,
          block.viewport,
          input.tabId,
        );
        block.moveToTab(targetTabId!);
      }
    }

    const updated = await this.blocksRepository.update(block);

    return toBlockDTO(updated);
  }

  private async resolveTargetTab(
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
      return target.id;
    }

    return tabs[0]?.id ?? null;
  }
}
