import { UserPreferencesEntity } from "../../entity/user-preferences/user-preferences-entity.js";
import { IUserPreferencesRepository } from "./user-preferences-repository.js";

export class InMemoryUserPreferencesRepository
  implements IUserPreferencesRepository
{
  private preferences = new Map<string, UserPreferencesEntity>();

  async findByUserId(userId: string): Promise<UserPreferencesEntity | null> {
    return this.preferences.get(userId) ?? null;
  }

  async provisionDefaults(userId: string): Promise<UserPreferencesEntity> {
    const existing = this.preferences.get(userId);

    if (existing) {
      return existing;
    }

    const created = UserPreferencesEntity.createDefault(userId);
    this.preferences.set(userId, created);
    return created;
  }

  async save(
    preferences: UserPreferencesEntity,
  ): Promise<UserPreferencesEntity> {
    // Stored by value, like a row: a test that mutates the entity it passed in
    // must not be able to change what a later read returns.
    const stored = new UserPreferencesEntity({
      userId: preferences.userId,
      language: preferences.language,
      theme: preferences.theme,
      createdAt:
        this.preferences.get(preferences.userId)?.createdAt ??
        preferences.createdAt,
      updatedAt: preferences.updatedAt,
    });

    this.preferences.set(stored.userId, stored);
    return stored;
  }

  // Helper methods for testing
  clear(): void {
    this.preferences.clear();
  }

  count(): number {
    return this.preferences.size;
  }
}
