import { CreateTabInput, ProfileTab } from "@repo/schemas";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import { IUnitOfWork } from "../../../providers/unit-of-work/unit-of-work.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toTabDTO } from "../assemble-layout.js";
import { VIEWPORTS } from "../seed-default-layout.js";

export class CreateTabUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private unitOfWork: IUnitOfWork,
  ) {}

  async execute(userId: string, input: CreateTabInput): Promise<ProfileTab> {
    // One logical tab spans both viewports: a single shared groupId links the
    // pc-row and mobile-row so the structure mirrors (only positions differ).
    const groupId = crypto.randomUUID();

    // Insert both viewport rows in one transaction so a mid-loop failure can't
    // leave the tab present in one viewport but missing in the other.
    const currentTab = await this.unitOfWork.runInTransaction(async (tx) => {
      let created: ProfileTabEntity | undefined;

      for (const viewport of VIEWPORTS) {
        const existingTabs = await this.tabsRepository.findByUserAndViewport(
          userId,
          viewport,
          tx,
        );

        const nextOrder =
          existingTabs.length === 0
            ? 0
            : Math.max(...existingTabs.map((tab) => tab.order)) + 1;

        const tab = ProfileTabEntity.create({
          userId,
          groupId,
          viewport,
          title: input.title,
          order: nextOrder,
        });

        const persisted = await this.tabsRepository.create(tab, tx);

        if (viewport === input.viewport) {
          created = persisted;
        }
      }

      return created!;
    });

    return toTabDTO(currentTab);
  }
}
