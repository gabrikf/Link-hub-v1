import { UserEntity } from "../../../entity/user/user-entity.js";
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
  /**
   * Banner / background placement and background treatment, as ONE object.
   *
   * `unknown` rather than the schema type: this arrives from an HTTP body, and
   * the entity re-parses it through `@repo/schemas` on the way in, so the use
   * case never has to trust a cast it did not perform.
   */
  appearance?: unknown;
  openToWork?: boolean;
  location?: string | null;
  persona?: string | null;
  /**
   * Free-text role label, only meaningful while `persona` is "other".
   * `undefined` leaves it alone, `null` clears it.
   */
  personaOther?: string | null;
}

/**
 * Applies every optional field the caller actually sent, and only those.
 *
 * `undefined` means "leave it alone" and `null` means "clear it", which is why
 * each field is tested with `typeof ... !== "undefined"` rather than for
 * truthiness — a `null` that meant "clear" would otherwise be skipped.
 */
function applySentProfileFields(
  user: UserEntity,
  input: IUpdateProfileInput,
): void {
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

  if (typeof input.appearance !== "undefined") {
    user.updateAppearance(input.appearance);
  }

  if (typeof input.openToWork !== "undefined") {
    user.updateOpenToWork(input.openToWork);
  }

  if (typeof input.location !== "undefined") {
    user.updateLocation(input.location ?? null);
  }

  if (typeof input.persona !== "undefined") {
    user.updatePersona(input.persona ?? null);
  }

  if (typeof input.personaOther !== "undefined") {
    user.updatePersonaOther(input.personaOther ?? null);
  }
}

export class UpdateProfileUseCase {
  constructor(private usersRepository: IUsersRepository) {}

  /**
   * A rename must not collide with somebody else's login. Keeping the login
   * unchanged is not a rename, so it never costs the extra lookup.
   */
  private async assertUsernameIsFree(
    currentLogin: string,
    username: string,
  ): Promise<void> {
    if (username === currentLogin) {
      return;
    }

    const userWithSameLogin = await this.usersRepository.findByLogin(username);

    if (userWithSameLogin) {
      throw new DuplicateResourceError("User", "login", username);
    }
  }

  async execute(input: IUpdateProfileInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    await this.assertUsernameIsFree(user.login, input.username);

    user.login = input.username;

    applySentProfileFields(user, input);

    /**
     * One invariant, enforced server-side rather than trusted from the client:
     * the custom label belongs to `persona === "other"` and nothing else.
     *
     * Without this, a user who typed "Fisioterapeuta", then switched to
     * "Developer", would keep a dangling label in the row — invisible on
     * screen (the enum label wins) until they picked "Other" again months
     * later and their old title reappeared out of nowhere. Clearing it here
     * means the stored row can never disagree with what is rendered.
     */
    if (user.persona !== "other") {
      user.updatePersonaOther(null);
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
      appearance: updatedUser.appearance,
      openToWork: updatedUser.openToWork,
      location: updatedUser.location,
      persona: updatedUser.persona,
      personaOther: updatedUser.personaOther,
      email: updatedUser.email,
    };
  }
}
