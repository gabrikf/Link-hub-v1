import {
  FullProfileLayout,
  ProfileLayout,
  ProfileViewport,
} from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IUnitOfWork } from "../../../providers/unit-of-work/unit-of-work.js";
import { IProfileBlocksRepository } from "../../../repositories/profile-block/profile-block-repository.js";
import { IProfileTabsRepository } from "../../../repositories/profile-tab/profile-tabs-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { assembleLayout } from "../assemble-layout.js";
import { ensureSeededViewport } from "../seed-default-layout.js";

export class GetLayoutUseCase {
  constructor(
    private tabsRepository: IProfileTabsRepository,
    private blocksRepository: IProfileBlocksRepository,
    private unitOfWork: IUnitOfWork,
    private usersRepository: IUsersRepository,
  ) {}

  async execute(
    userId: string,
    viewport?: ProfileViewport,
  ): Promise<ProfileLayout | FullProfileLayout> {
    // `tabsEnabled` lives on the user row, one column per viewport, so the
    // layout read has to load the user too. Read once here rather than per
    // viewport: both branches below need it and it cannot change mid-request.
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new ResourceNotFoundError("User", userId);
    }

    if (viewport) {
      return this.buildViewport(
        userId,
        viewport,
        user.tabsEnabledFor(viewport),
      );
    }

    // Sequential (not parallel): seeding a viewport also mirrors to the other
    // viewport with shared groupIds, so building pc first ensures mobile is
    // already seeded (or vice-versa) — avoiding a double-seed race.
    const pc = await this.buildViewport(userId, "pc", user.tabsEnabledPc);
    const mobile = await this.buildViewport(
      userId,
      "mobile",
      user.tabsEnabledMobile,
    );

    return { pc, mobile };
  }

  private async buildViewport(
    userId: string,
    viewport: ProfileViewport,
    tabsEnabled: boolean,
  ): Promise<ProfileLayout> {
    const { tabs, blocks } = await ensureSeededViewport(
      this.tabsRepository,
      this.blocksRepository,
      this.unitOfWork,
      userId,
      viewport,
    );

    return assembleLayout(tabs, blocks, tabsEnabled);
  }
}
