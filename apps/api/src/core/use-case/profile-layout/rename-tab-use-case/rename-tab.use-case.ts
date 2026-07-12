import { ProfileTab } from "@repo/schemas";
import { ForbiddenError, ResourceNotFoundError } from "../../../errors/index.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { toTabDTO } from "../assemble-layout.js";

export class RenameTabUseCase {
  constructor(private tabsRepository: IProfileTabsRepository) {}

  async execute(
    userId: string,
    tabId: string,
    title: string,
  ): Promise<ProfileTab> {
    const tab = await this.tabsRepository.findById(tabId);

    if (!tab) {
      throw new ResourceNotFoundError("ProfileTab", tabId);
    }

    if (tab.userId !== userId) {
      throw new ForbiddenError("You do not own this tab");
    }

    const updated = await this.tabsRepository.rename(tabId, title);

    return toTabDTO(updated);
  }
}
