import { UserPreferencesEntity } from "../../entity/user-preferences/user-preferences-entity.js";

export interface IUserPreferencesRepository {
  findByUserId(userId: string): Promise<UserPreferencesEntity | null>;

  /**
   * Returns the caller's row, creating one with the column defaults if it is
   * missing. Never overwrites an existing row — a read path that could clobber
   * a saved preference is worse than the 500 it was meant to prevent.
   */
  provisionDefaults(userId: string): Promise<UserPreferencesEntity>;

  /**
   * Create-or-replace. Implementations must do this in ONE statement: a
   * select-then-insert loses the race against a concurrent first save and
   * surfaces as a duplicate-key 500 on the second tab a user has open.
   */
  save(preferences: UserPreferencesEntity): Promise<UserPreferencesEntity>;
}
