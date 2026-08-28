/**
 * Database-level guarantees for `user_preferences`. NEEDS REAL POSTGRES —
 * `bash db-manage.sh start` — hence the `.e2e.test.ts` name, matching the other
 * files in this repo that cannot run without infrastructure.
 *
 * The zod schemas at the HTTP edge already reject a bad locale or theme, so it
 * is tempting to call the CHECK constraints belt-and-braces. They are not: a
 * migration, a seed script, a support fix typed into psql and a restored dump
 * all write to this table without ever meeting zod. A stored `theme = 'sepia'`
 * would then be read back as a valid `ThemePreference` by every consumer and
 * fail at render time, on one account, with nothing in the logs pointing at the
 * write that caused it.
 *
 * These tests attempt exactly those writes and require the database to refuse
 * them.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { UserPreferencesEntity } from "../../../core/entity/user-preferences/user-preferences-entity.js";
import { DrizzleUserPreferencesRepository } from "./repositories/user-preferences.repository.js";
import { db } from "./index.js";
import { userPreferences, users } from "./schema.js";

const SUITE_TAG = `user-prefs-constraints-${Date.now()}`;

/**
 * Runs a write that must be refused and returns the name of the constraint that
 * refused it.
 *
 * Asserting the constraint NAME rather than "it threw" is the point: an insert
 * that fails for an unrelated reason — a typo in a column, a missing user — is
 * a green test that proves nothing about the CHECK. Drizzle wraps the driver
 * error, so the driver error — which names the constraint — is on `cause`.
 */
async function rejectedBy(write: Promise<unknown>): Promise<string> {
  try {
    await write;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;

    if (cause && typeof cause === "object") {
      // `postgres` (postgres.js) names it `constraint_name`; node-postgres uses
      // `constraint`. Read both so this does not become a driver-swap landmine.
      const named = cause as {
        constraint_name?: unknown;
        constraint?: unknown;
      };
      const constraint = named.constraint_name ?? named.constraint;

      if (typeof constraint === "string") {
        return constraint;
      }
    }

    throw error;
  }

  throw new Error("expected the write to be rejected, but it succeeded");
}

async function seedUser(tag: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      email: `${tag}@example.test`,
      login: tag,
      name: "User Preferences Constraints",
      password: "not-a-real-hash",
    })
    .returning({ id: users.id });

  if (!row) throw new Error("failed to seed the constraints-test user");
  return row.id;
}

describe("user_preferences database constraints", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await seedUser(SUITE_TAG);
  });

  afterAll(async () => {
    // Cascades the preferences row away with it.
    await db.delete(users).where(eq(users.id, userId));
  });

  beforeEach(async () => {
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
  });

  it("rejects a language outside the three shipped locales", async () => {
    await expect(
      rejectedBy(db.insert(userPreferences).values({ userId, language: "xx-XX" })),
    ).resolves.toBe("user_preferences_language_check");
  });

  it("rejects a plain primary subtag that the API would have widened", async () => {
    // `pt` is resolved to `pt-BR` by `resolveUiLanguage` BEFORE it is stored.
    // Storing the raw tag would leave a value no consumer maps back, so the
    // column must not accept it either.
    await expect(
      rejectedBy(db.insert(userPreferences).values({ userId, language: "pt" })),
    ).resolves.toBe("user_preferences_language_check");
  });

  it("rejects a theme outside light|dark|system", async () => {
    await expect(
      rejectedBy(db.insert(userPreferences).values({ userId, theme: "sepia" })),
    ).resolves.toBe("user_preferences_theme_check");
  });

  it("rejects an UPDATE into a bad theme, not just an INSERT", async () => {
    await db.insert(userPreferences).values({ userId, theme: "dark" });

    await expect(
      rejectedBy(
        db
          .update(userPreferences)
          .set({ theme: "sepia" })
          .where(eq(userPreferences.userId, userId)),
      ),
    ).resolves.toBe("user_preferences_theme_check");

    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(row?.theme).toBe("dark");
  });

  it("accepts every value the product actually ships", async () => {
    // The control. Without it a constraint that rejected EVERYTHING would make
    // all the tests above pass.
    for (const language of ["en-US", "pt-BR", "es-ES", null]) {
      for (const theme of ["light", "dark", "system"]) {
        await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
        await db.insert(userPreferences).values({ userId, language, theme });

        const [row] = await db
          .select()
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId));
        expect(row?.language).toBe(language);
        expect(row?.theme).toBe(theme);
      }
    }
  });

  it("defaults an untouched row to follow-the-device", async () => {
    await db.insert(userPreferences).values({ userId });

    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    // The same pair the backfill in migration 0020 writes for every account
    // that predates the table.
    expect(row?.language).toBeNull();
    expect(row?.theme).toBe("system");
  });

  it("allows only one row per user", async () => {
    await db.insert(userPreferences).values({ userId });

    // `user_id` is the primary key, which is what makes the 1:1 structural
    // rather than a convention someone can forget.
    await expect(
      rejectedBy(db.insert(userPreferences).values({ userId })),
    ).resolves.toBe("user_preferences_pkey");
  });

  it("deletes the preferences row when the user is deleted", async () => {
    const doomedId = await seedUser(`${SUITE_TAG}-cascade`);
    await db.insert(userPreferences).values({ userId: doomedId });

    await db.delete(users).where(eq(users.id, doomedId));

    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, doomedId));
    expect(rows).toHaveLength(0);
  });
});

/**
 * The Drizzle repository against the real table. The in-memory double cannot
 * catch the two things that actually go wrong here: an upsert written as
 * select-then-insert (which races) and a provisioning read that overwrites the
 * row it was only supposed to fetch.
 */
describe("DrizzleUserPreferencesRepository", () => {
  const repository = new DrizzleUserPreferencesRepository();
  let userId: string;

  beforeAll(async () => {
    userId = await seedUser(`${SUITE_TAG}-repo`);
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, userId));
  });

  beforeEach(async () => {
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
  });

  it("returns null when the user has no row", async () => {
    await expect(repository.findByUserId(userId)).resolves.toBeNull();
  });

  it("provisions follow-the-device defaults exactly once", async () => {
    const first = await repository.provisionDefaults(userId);
    expect(first.language).toBeNull();
    expect(first.theme).toBe("system");

    // Called again — as it is on every session start — it must return the same
    // row rather than raising a duplicate key.
    const second = await repository.provisionDefaults(userId);
    expect(second.userId).toBe(userId);

    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("never overwrites a saved preference while provisioning", async () => {
    await repository.save(
      new UserPreferencesEntity({
        userId,
        language: "pt-BR",
        theme: "dark",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const provisioned = await repository.provisionDefaults(userId);

    // The bug: `onConflictDoUpdate` writing the defaults into the SET clause,
    // which resets the user's language and theme every time the app boots.
    expect(provisioned.language).toBe("pt-BR");
    expect(provisioned.theme).toBe("dark");
  });

  it("upserts without a prior read", async () => {
    const saved = await repository.save(
      new UserPreferencesEntity({
        userId,
        language: "es-ES",
        theme: "light",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    expect(saved.language).toBe("es-ES");

    // The row really changed — read it straight out of the table rather than
    // trusting the value the repository handed back.
    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(row?.language).toBe("es-ES");
    expect(row?.theme).toBe("light");
  });

  it("keeps created_at across an update", async () => {
    const created = await repository.provisionDefaults(userId);

    await repository.save(
      new UserPreferencesEntity({
        userId,
        language: "en-US",
        theme: "dark",
        // A caller that did not read the row first would supply a fresh date.
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));
    expect(row?.createdAt.getTime()).toBe(created.createdAt.getTime());
  });
});
