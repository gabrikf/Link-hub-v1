import { ResourceNotFoundError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { toPublicLayout } from "../../profile-layout/assemble-layout.js";
import { seedDefaultLayout } from "../../profile-layout/seed-default-layout.js";

export class GetPublicProfileUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private linksRepository: ILinksRepository,
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
  ) {}

  async execute(username: string) {
    const user = await this.usersRepository.findByLogin(username);

    if (!user) {
      throw new ResourceNotFoundError("User", username);
    }

    // All three depend on `user.id` and on nothing else, so they overlap. Unlike
    // the layout read path in `get-layout.use-case.ts`, none of these writes.
    const [links, pc, mobile] = await Promise.all([
      this.linksRepository.findPublicByUserId(user.id),
      this.buildPublicViewport(user.id, "pc"),
      this.buildPublicViewport(user.id, "mobile"),
    ]);

    return {
      username: user.login,
      name: user.name,
      description: user.description,
      userPhoto: user.avatarUrl,
      backgroundImageUrl: user.backgroundImageUrl,
      bannerImageUrl: user.bannerImageUrl,
      themeAccent: user.themeAccent,
      themePreset: user.themePreset,
      openToWork: user.openToWork,
      tabsEnabled: user.tabsEnabled,
      location: user.location,
      persona: user.persona,
      links,
      layout: { pc, mobile },
    };
  }

  private async buildPublicViewport(userId: string, viewport: "pc" | "mobile") {
    const tabs = await this.tabsRepository.findByUserAndViewport(
      userId,
      viewport,
    );

    // The public read path must NEVER write: seeding here would let anonymous
    // visitors create rows in the owner's account and could double-seed under
    // concurrency. When the owner hasn't configured this viewport yet, render
    // the canonical default layout in memory (persisted only via /me/layout).
    if (tabs.length === 0) {
      const { tab, blocks } = seedDefaultLayout(userId)[viewport];
      return toPublicLayout([tab], blocks);
    }

    const blocks = await this.blocksRepository.findByUserAndViewport(
      userId,
      viewport,
    );
    return toPublicLayout(tabs, blocks);
  }
}
