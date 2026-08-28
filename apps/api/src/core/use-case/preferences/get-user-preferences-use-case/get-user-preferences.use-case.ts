import type { UserPreferences } from "@repo/schemas";
import type { IUserPreferencesRepository } from "../../../repositories/user-preferences/user-preferences-repository.js";

/**
 * Reads the caller's UI preferences, provisioning defaults when the row is
 * missing.
 *
 * The missing row is not hypothetical: an account created before the migration
 * that added the table, or by any future code path that forgets to write one,
 * would otherwise get a 500 on the very first request after login — and the web
 * client fetches this on session start, so that 500 lands before the user has
 * done anything at all. Defaults are the honest answer there, because "no row"
 * and "follow the device" mean exactly the same thing.
 */
export class GetUserPreferencesUseCase {
  constructor(
    private userPreferencesRepository: IUserPreferencesRepository,
  ) {}

  async execute(userId: string): Promise<UserPreferences> {
    const existing = await this.userPreferencesRepository.findByUserId(userId);

    if (existing) {
      return existing.toResponse();
    }

    const provisioned =
      await this.userPreferencesRepository.provisionDefaults(userId);

    return provisioned.toResponse();
  }
}
