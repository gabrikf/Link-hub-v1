import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
  type UiLanguage,
  type UserPreferences,
} from "@repo/schemas";

export interface UserPreferencesEntityProps {
  /**
   * The identity of this record. There is no surrogate `id`: the row is 1:1
   * with a user and `user_id` is both the primary key and the foreign key, so
   * inventing a second identifier would only create a way for the two to
   * disagree. That is why this entity does not extend `BaseEntity` — every
   * other entity here has its own `id` column and this one genuinely does not.
   */
  userId: string;
  /** `null` = follow the device. A real stored state, not an absent one. */
  language: UiLanguage | null;
  theme: ThemePreference;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A partial patch. `undefined` means "not provided, leave it alone";
 * `null` on `language` means "go back to following the device". Collapsing
 * those two into one value is how a theme-only save silently wipes a user's
 * chosen language.
 */
export interface UpdateUserPreferencesEntityProps {
  language?: UiLanguage | null;
  theme?: ThemePreference;
}

export class UserPreferencesEntity {
  public userId: string;
  public language: UiLanguage | null;
  public theme: ThemePreference;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(props: UserPreferencesEntityProps) {
    this.userId = props.userId;
    this.language = props.language;
    this.theme = props.theme;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * What an untouched account gets: follow the device for both. Matches the
   * column defaults in `user_preferences`, so a row provisioned in the database
   * and one provisioned here are the same row.
   */
  static createDefault(userId: string): UserPreferencesEntity {
    const now = new Date();

    return new UserPreferencesEntity({
      userId,
      language: null,
      theme: DEFAULT_THEME_PREFERENCE,
      createdAt: now,
      updatedAt: now,
    });
  }

  applyUpdate(props: UpdateUserPreferencesEntityProps): void {
    if (props.language !== undefined) {
      this.language = props.language;
    }

    if (props.theme !== undefined) {
      this.theme = props.theme;
    }

    this.updatedAt = new Date();
  }

  /**
   * The wire shape (`userPreferencesSchema`). Deliberately narrow: `userId` and
   * the timestamps stay inside the API, because the only consumer is the
   * caller's own client and it already knows who it is.
   */
  toResponse(): UserPreferences {
    return {
      language: this.language,
      theme: this.theme,
    };
  }
}
