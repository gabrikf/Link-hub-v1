import {
  CreateBlockInput,
  CUSTOM_BLOCK_KINDS,
  customBlockConfigSchemaByKind,
  CustomBlockKind,
  GRID_COLUMNS,
  ProfileBlock,
  ProfileViewport,
} from "@repo/schemas";
import { ProfileBlockEntity } from "../../../entity/profile-block/profile-block-entity.js";
import { BadRequestError } from "../../../errors/index.js";
import { IUnitOfWork } from "../../../providers/unit-of-work/unit-of-work.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toBlockDTO } from "../assemble-layout.js";
import { ensureSeededViewport, VIEWPORTS } from "../seed-default-layout.js";

const DEFAULT_BLOCK_HEIGHT = 4;

export class CreateBlockUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
    private unitOfWork: IUnitOfWork,
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

    // Seed the requested viewport on first access — this also mirrors the seed
    // to the other viewport (shared groupIds), so both viewports have tabs. Runs
    // in its own advisory-locked transaction (see ensureSeededViewport).
    await ensureSeededViewport(
      this.tabsRepository,
      this.blocksRepository,
      this.unitOfWork,
      userId,
      input.viewport,
    );

    // A single shared groupId links the block's pc-row and mobile-row.
    const groupId = crypto.randomUUID();

    // Resolve the target grouping and insert both viewport rows in ONE
    // transaction so the block can't end up mirrored in one viewport but
    // missing in the other. A validation failure rolls the whole thing back.
    const currentBlock = await this.unitOfWork.runInTransaction(async (tx) => {
      const currentTabs = await this.tabsRepository.findByUserAndViewport(
        userId,
        input.viewport,
        tx,
      );

      // Resolve the target grouping against the CURRENT viewport, then carry it
      // across viewports by the tab's groupId (positions/tabIds are
      // per-viewport, but which logical tab a block belongs to is shared).
      let targetTabGroupId: string | null;
      let pinnedAllTabs = false;

      if (input.tabId === null) {
        targetTabGroupId = null;
        pinnedAllTabs = true;
      } else if (typeof input.tabId === "string") {
        const targetTab = currentTabs.find((tab) => tab.id === input.tabId);
        if (!targetTab) {
          throw new BadRequestError("Target tab does not exist");
        }
        targetTabGroupId = targetTab.groupId;
      } else {
        const firstTab = currentTabs[0];
        targetTabGroupId = firstTab?.groupId ?? null;
        pinnedAllTabs = targetTabGroupId === null;
      }

      let created: ProfileBlockEntity | undefined;

      for (const viewport of VIEWPORTS) {
        const viewportTabs = await this.tabsRepository.findByUserAndViewport(
          userId,
          viewport,
          tx,
        );

        const tabId =
          pinnedAllTabs || targetTabGroupId === null
            ? null
            : (viewportTabs.find((tab) => tab.groupId === targetTabGroupId)
                ?.id ?? null);

        const position = this.resolvePosition(
          await this.blocksRepository.findByUserAndViewport(
            userId,
            viewport,
            tx,
          ),
          tabId,
          viewport,
          // Placement is only meaningful for the viewport the client is
          // editing; the mirrored viewport gets a sensible default (appended,
          // full-width).
          viewport === input.viewport ? input.placement : undefined,
        );

        const block = ProfileBlockEntity.create({
          userId,
          groupId,
          viewport,
          tabId,
          kind,
          gridX: position.gridX,
          gridY: position.gridY,
          gridW: position.gridW,
          gridH: position.gridH,
          isVisible: true,
          pinnedAllTabs,
          config: configResult.data,
        });

        const persisted = await this.blocksRepository.create(block, tx);

        if (viewport === input.viewport) {
          created = persisted;
        }
      }

      return created!;
    });

    return toBlockDTO(currentBlock);
  }

  private resolvePosition(
    viewportBlocks: ProfileBlockEntity[],
    tabId: string | null,
    viewport: ProfileViewport,
    placement: CreateBlockInput["placement"],
  ) {
    const gridW = placement?.gridW ?? GRID_COLUMNS[viewport];
    const gridX = placement?.gridX ?? 0;
    const gridH = placement?.gridH ?? DEFAULT_BLOCK_HEIGHT;

    const groupBlocks = viewportBlocks.filter(
      (block) => block.tabId === tabId,
    );
    const bottomY = groupBlocks.reduce(
      (max, block) => Math.max(max, block.gridY + block.gridH),
      0,
    );
    const gridY = placement?.gridY ?? bottomY;

    return { gridX, gridY, gridW, gridH };
  }
}
