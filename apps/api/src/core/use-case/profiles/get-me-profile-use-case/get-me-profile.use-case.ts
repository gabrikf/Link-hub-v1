import { ResourceNotFoundError } from "../../../errors/index.js";
import { ILinksRepository } from "../../../repositories/link/link-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export class GetMeProfileUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private linksRepository: ILinksRepository,
  ) {}

  async execute(userId: string) {
    // Both are keyed by the authenticated `userId`, so the links read does not
    // need to wait on the user read. The not-found path pays for one extra
    // (already-issued) query, which beats serialising every successful request.
    const [user, links] = await Promise.all([
      this.usersRepository.findById(userId),
      this.linksRepository.findByUserId(userId),
    ]);

    if (!user) {
      throw new ResourceNotFoundError("User", userId);
    }

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
    };
  }
}
