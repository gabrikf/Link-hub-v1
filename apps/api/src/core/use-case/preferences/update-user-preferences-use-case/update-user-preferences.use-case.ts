import type {
  ThemePreference,
  UiLanguage,
  UserPreferences,
} from "@repo/schemas";
import { UserPreferencesEntity } from "../../../entity/user-preferences/user-preferences-entity.js";
import type { IUserPreferencesRepository } from "../../../repositories/user-preferences/user-preferences-repository.js";

export interface IUpdateUserPreferencesInput {
  userId: string;
  /** Absent = leave as-is. `null` = go back to following the device. */
  language?: UiLanguage | null;
  theme?: ThemePreference;
}

/**
 * Partial update with upsert semantics, returning the FULL new state.
 *
 * Returning the whole state rather than an acknowledgement is what lets the web
 * client mirror the authoritative values into `localStorage` after a save that
 * only touched one of them — otherwise the pre-paint cache drifts from the
 * database and the next load flashes the wrong theme.
 */
export class UpdateUserPreferencesUseCase {
  constructor(
    private userPreferencesRepository: IUserPreferencesRepository,
  ) {}

  async execute(input: IUpdateUserPreferencesInput): Promise<UserPreferences> {
    const existing = await this.userPreferencesRepository.findByUserId(
      input.userId,
    );

    // No row yet is not an error: the patch is applied on top of the defaults
    // and saved in one upsert, so a first-ever save behaves like any other.
    const preferences =
      existing ?? UserPreferencesEntity.createDefault(input.userId);

    preferences.applyUpdate({
      language: input.language,
      theme: input.theme,
    });

    const saved = await this.userPreferencesRepository.save(preferences);

    return saved.toResponse();
  }
}
