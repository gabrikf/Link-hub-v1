import {
  FullProfileLayout,
  ProfileLayout,
  ProfileViewport,
} from "@repo/schemas";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { assembleLayout } from "../assemble-layout.js";
import { ensureSeededViewport } from "../seed-default-layout.js";

export class GetLayoutUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
  ) {}

  async execute(
    userId: string,
    viewport?: ProfileViewport,
  ): Promise<ProfileLayout | FullProfileLayout> {
    if (viewport) {
      return this.buildViewport(userId, viewport);
    }

    const [pc, mobile] = await Promise.all([
      this.buildViewport(userId, "pc"),
      this.buildViewport(userId, "mobile"),
    ]);

    return { pc, mobile };
  }

  private async buildViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileLayout> {
    const { tabs, blocks } = await ensureSeededViewport(
      this.tabsRepository,
      this.blocksRepository,
      userId,
      viewport,
    );

    return assembleLayout(tabs, blocks);
  }
}
