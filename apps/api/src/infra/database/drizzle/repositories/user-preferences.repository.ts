import { eq } from "drizzle-orm";
import {
  DEFAULT_THEME_PREFERENCE,
  themePreferenceSchema,
  uiLanguageSchema,
} from "@repo/schemas";
import { UserPreferencesEntity } from "../../../../core/entity/user-preferences/user-preferences-entity.js";
import { IUserPreferencesRepository } from "../../../../core/repositories/user-preferences/user-preferences-repository.js";
import { db } from "../index.js";
import { userPreferences } from "../schema.js";

/**
 * The row shape Drizzle hands back. `language` and `theme` are `text` columns —
 * the CHECK constraints keep them honest, but the TypeScript type is still
 * `string`, so they are parsed rather than asserted on the way out.
 */
interface UserPreferencesRow {
  userId: string;
  language: string | null;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Row → entity. A value that somehow got past the CHECK constraint (a hand-run
 * UPDATE, a restored dump from before the constraint existed) degrades to the
 * "follow the device" default instead of being cast through as a lie: the
 * response schema would reject it downstream and the user would see a 500 for
 * data they cannot fix.
 */
function toEntity(row: UserPreferencesRow): UserPreferencesEntity {
  const language = uiLanguageSchema.safeParse(row.language);
  const theme = themePreferenceSchema.safeParse(row.theme);

  return new UserPreferencesEntity({
    userId: row.userId,
    language: language.success ? language.data : null,
    theme: theme.success ? theme.data : DEFAULT_THEME_PREFERENCE,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleUserPreferencesRepository
  implements IUserPreferencesRepository
{
  async findByUserId(userId: string): Promise<UserPreferencesEntity | null> {
    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    if (!row) return null;

    return toEntity(row);
  }

  async provisionDefaults(userId: string): Promise<UserPreferencesEntity> {
    /*
     * Insert-or-get in one statement.
     *
     * `onConflictDoUpdate` writing `user_id` back to itself is deliberate: it
     * changes nothing, but unlike `onConflictDoNothing` it still RETURNS the
     * conflicting row, so the caller gets the existing preferences instead of
     * an empty result it would have to go and select again. A second round trip
     * here is also a race — two tabs opening at once would each see "nothing
     * inserted" and then read.
     *
     * What it must never do is write defaults over a row that already exists.
     * It does not: only `user_id` is in the SET, and it is unchanged.
     */
    const [row] = await db
      .insert(userPreferences)
      .values({ userId })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { userId },
      })
      .returning();

    if (!row) {
      throw new Error(
        `Failed to provision preferences for user '${userId}'`,
      );
    }

    return toEntity(row);
  }

  async save(
    preferences: UserPreferencesEntity,
  ): Promise<UserPreferencesEntity> {
    const [row] = await db
      .insert(userPreferences)
      .values({
        userId: preferences.userId,
        language: preferences.language,
        theme: preferences.theme,
        createdAt: preferences.createdAt,
        updatedAt: preferences.updatedAt,
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          language: preferences.language,
          theme: preferences.theme,
          updatedAt: preferences.updatedAt,
        },
      })
      .returning();

    if (!row) {
      throw new Error(
        `Failed to save preferences for user '${preferences.userId}'`,
      );
    }

    return toEntity(row);
  }
}
