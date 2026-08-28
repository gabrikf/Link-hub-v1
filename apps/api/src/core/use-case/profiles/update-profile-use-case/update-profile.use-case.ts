import {
  DuplicateResourceError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface IUpdateProfileInput {
  userId: string;
  username: string;
  name?: string;
  description?: string | null;
  userPhoto?: string | null;
  backgroundImageUrl?: string | null;
  bannerImageUrl?: string | null;
  themeAccent?: string | null;
  themePreset?: string | null;
  openToWork?: boolean;
  tabsEnabled?: boolean;
  location?: string | null;
  persona?: string | null;
}

export class UpdateProfileUseCase {
  constructor(private usersRepository: IUsersRepository) {}

  async execute(input: IUpdateProfileInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    if (input.username !== user.login) {
      const userWithSameLogin = await this.usersRepository.findByLogin(
        input.username,
      );

      if (userWithSameLogin) {
        throw new DuplicateResourceError("User", "login", input.username);
      }
    }

    user.login = input.username;

    if (typeof input.name === "string") {
      user.name = input.name;
    }

    if (typeof input.description !== "undefined") {
      user.updateDescription(input.description ?? null);
    }

    if (typeof input.userPhoto !== "undefined") {
      user.updateAvatarUrl(input.userPhoto ?? null);
    }

    if (typeof input.backgroundImageUrl !== "undefined") {
      user.updateBackgroundImageUrl(input.backgroundImageUrl ?? null);
    }

    if (typeof input.bannerImageUrl !== "undefined") {
      user.updateBannerImageUrl(input.bannerImageUrl ?? null);
    }

    if (typeof input.themeAccent !== "undefined") {
      user.updateThemeAccent(input.themeAccent ?? null);
    }

    if (typeof input.themePreset !== "undefined") {
      user.updateThemePreset(input.themePreset ?? null);
    }

    if (typeof input.openToWork !== "undefined") {
      user.updateOpenToWork(input.openToWork);
    }

    /*
     * Presentation only. Nothing here touches `profile_tabs` or
     * `profile_blocks`: turning tabs off must be reversible, and a user who
     * flips it back on has to get the exact layout they had. Deleting or
     * reassigning blocks here would make the switch a destructive action
     * disguised as a toggle.
     */
    if (typeof input.tabsEnabled !== "undefined") {
      user.updateTabsEnabled(input.tabsEnabled);
    }

    if (typeof input.location !== "undefined") {
      user.updateLocation(input.location ?? null);
    }

    if (typeof input.persona !== "undefined") {
      user.updatePersona(input.persona ?? null);
    }

    user.updateTimestamp();

    const updatedUser = await this.usersRepository.update(user);

    return {
      id: updatedUser.id,
      username: updatedUser.login,
      name: updatedUser.name,
      description: updatedUser.description,
      userPhoto: updatedUser.avatarUrl,
      backgroundImageUrl: updatedUser.backgroundImageUrl,
      bannerImageUrl: updatedUser.bannerImageUrl,
      themeAccent: updatedUser.themeAccent,
      themePreset: updatedUser.themePreset,
      openToWork: updatedUser.openToWork,
      tabsEnabled: updatedUser.tabsEnabled,
      location: updatedUser.location,
      persona: updatedUser.persona,
      email: updatedUser.email,
    };
  }
}
