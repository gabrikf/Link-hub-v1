import { CreateTabInput, ProfileTab } from "@repo/schemas";
import { ProfileTabEntity } from "../../../entity/profile-tab/profile-tab-entity.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toTabDTO } from "../assemble-layout.js";

export class CreateTabUseCase {
  constructor(private tabsRepository: IProfileTabsRepository) {}

  async execute(userId: string, input: CreateTabInput): Promise<ProfileTab> {
    const existingTabs = await this.tabsRepository.findByUserAndViewport(
      userId,
      input.viewport,
    );

    const nextOrder =
      existingTabs.length === 0
        ? 0
        : Math.max(...existingTabs.map((tab) => tab.order)) + 1;

    const tab = ProfileTabEntity.create({
      userId,
      viewport: input.viewport,
      title: input.title,
      order: nextOrder,
    });

    const created = await this.tabsRepository.create(tab);

    return toTabDTO(created);
  }
}
