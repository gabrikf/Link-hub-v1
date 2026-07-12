import {
  CreateBlockInput,
  CUSTOM_BLOCK_KINDS,
  customBlockConfigSchemaByKind,
  CustomBlockKind,
  GRID_COLUMNS,
  ProfileBlock,
} from "@repo/schemas";
import { ProfileBlockEntity } from "../../../entity/profile-block/profile-block-entity.js";
import { BadRequestError } from "../../../errors/index.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toBlockDTO } from "../assemble-layout.js";
import { ensureSeededViewport } from "../seed-default-layout.js";

const DEFAULT_BLOCK_HEIGHT = 4;

export class CreateBlockUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
  ) {}

  async execute(
    userId: string,
    input: CreateBlockInput,
  ): Promise<ProfileBlock> {
    const kind = input.kind;

    if (!CUSTOM_BLOCK_KINDS.includes(kind as CustomBlockKind)) {
      throw new BadRequestError("Only custom blocks can be created");
    }

    const configSchema = customBlockConfigSchemaByKind[kind as CustomBlockKind];
    const configResult = configSchema.safeParse(input.config);
    if (!configResult.success) {
      throw new BadRequestError("Invalid block config for the given kind");
    }

    const { tabs, blocks } = await ensureSeededViewport(
      this.tabsRepository,
      this.blocksRepository,
      userId,
      input.viewport,
    );

    // Resolve the target grouping: explicit null → pinned across tabs, a string
    // → a concrete (owned) tab, undefined → the first tab of the viewport.
    let tabId: string | null;
    let pinnedAllTabs = false;

    if (input.tabId === null) {
      tabId = null;
      pinnedAllTabs = true;
    } else if (typeof input.tabId === "string") {
      const targetTab = tabs.find((tab) => tab.id === input.tabId);
      if (!targetTab) {
        throw new BadRequestError("Target tab does not exist");
      }
      tabId = targetTab.id;
    } else {
      tabId = tabs[0]?.id ?? null;
      pinnedAllTabs = tabId === null;
    }

    const gridW = input.placement?.gridW ?? GRID_COLUMNS[input.viewport];
    const gridX = input.placement?.gridX ?? 0;
    const gridH = input.placement?.gridH ?? DEFAULT_BLOCK_HEIGHT;

    const groupBlocks = blocks.filter((block) => block.tabId === tabId);
    const bottomY = groupBlocks.reduce(
      (max, block) => Math.max(max, block.gridY + block.gridH),
      0,
    );
    const gridY = input.placement?.gridY ?? bottomY;

    const block = ProfileBlockEntity.create({
      userId,
      viewport: input.viewport,
      tabId,
      kind,
      gridX,
      gridY,
      gridW,
      gridH,
      isVisible: true,
      pinnedAllTabs,
      config: configResult.data,
    });

    const created = await this.blocksRepository.create(block);

    return toBlockDTO(created);
  }
}
