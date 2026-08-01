import {
  FullProfileLayout,
  ProfileLayout,
  ProfileViewport,
} from "@repo/schemas";
import { IUnitOfWork } from "../../../providers/unit-of-work/unit-of-work.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { assembleLayout } from "../assemble-layout.js";
import { ensureSeededViewport } from "../seed-default-layout.js";

export class GetLayoutUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
    private unitOfWork: IUnitOfWork,
  ) {}

  async execute(
    userId: string,
    viewport?: ProfileViewport,
  ): Promise<ProfileLayout | FullProfileLayout> {
    if (viewport) {
      return this.buildViewport(userId, viewport);
    }

    // Sequential (not parallel): seeding a viewport also mirrors to the other
    // viewport with shared groupIds, so building pc first ensures mobile is
    // already seeded (or vice-versa) — avoiding a double-seed race.
    const pc = await this.buildViewport(userId, "pc");
    const mobile = await this.buildViewport(userId, "mobile");

    return { pc, mobile };
  }

  private async buildViewport(
    userId: string,
    viewport: ProfileViewport,
  ): Promise<ProfileLayout> {
    const { tabs, blocks } = await ensureSeededViewport(
      this.tabsRepository,
      this.blocksRepository,
      this.unitOfWork,
      userId,
      viewport,
    );

    return assembleLayout(tabs, blocks);
  }
}
