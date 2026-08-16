import { CreateTabInput, ProfileTab } from "@repo/schemas";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toTabDTO } from "../assemble-layout.js";

export class CreateTabUseCase {
  constructor(private tabsRepository: IProfileTabsRepository) {}

  async execute(userId: string, input: CreateTabInput): Promise<ProfileTab> {
    // Tabs belong to ONE viewport. Adding a tab in the mobile editor must not
    // add one to the desktop layout — that mirroring is exactly what made the
    // two editors duplicate each other's content.
    const existingTabs = await this.tabsRepository.findByUserAndViewport(
      userId,
      input.viewport,
    );

    const nextOrder =
      existingTabs.length === 0
        ? 0
        : Math.max(...existingTabs.map((tab) => tab.order)) + 1;

    const created = await this.tabsRepository.create(
      ProfileTabEntity.create({
        userId,
        viewport: input.viewport,
        title: input.title,
        order: nextOrder,
      }),
    );

    return toTabDTO(created);
  }
}
