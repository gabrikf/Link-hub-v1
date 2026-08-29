import { SetTabsEnabledInput } from "@repo/schemas";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

/**
 * Flips ONE viewport's tab strip.
 *
 * Two guarantees, both load-bearing:
 *
 *  1. The other viewport is untouched. `tabs_enabled_pc` and
 *     `tabs_enabled_mobile` are separate columns precisely so that turning tabs
 *     off on a phone layout leaves the desktop one alone — the single shared
 *     flag that preceded them made one switch silently move both.
 *  2. Nothing outside the user row is written. No tab, no block, no
 *     `isVisible`. Turning tabs off renders less; it never edits content. A
 *     write here would make an innocuous-looking toggle destroy a page, and
 *     turning it back on would no longer restore what was there.
 */
export class SetTabsEnabledUseCase {
  constructor(private usersRepository: IUsersRepository) {}

  async execute(
    userId: string,
    input: SetTabsEnabledInput,
  ): Promise<{
    viewport: SetTabsEnabledInput["viewport"];
    tabsEnabled: boolean;
  }> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new ResourceNotFoundError("User", userId);
    }

    user.updateTabsEnabled(input.viewport, input.tabsEnabled);

    const updated = await this.usersRepository.update(user);

    return {
      viewport: input.viewport,
      tabsEnabled: updated.tabsEnabledFor(input.viewport),
    };
  }
}
