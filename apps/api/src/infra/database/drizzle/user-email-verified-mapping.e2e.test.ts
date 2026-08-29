/**
 * Round-trip of `users.email_verified_at` through the Drizzle repository.
 * NEEDS REAL POSTGRES — `bash db-manage.sh start` — hence the `.e2e.test.ts`
 * name, matching the other files here that cannot run without infrastructure.
 *
 * WHY THIS FILE EXISTS, precisely:
 *
 * The email-verification work shipped with `emailVerifiedAt` on the entity, in
 * the schema, in the migration and in every use case — and NOT in
 * `DrizzleUserRepository`'s hand-written column mapping. Nothing caught it. The
 * use-case tests run against the in-memory repository, which stores the entity
 * object itself and therefore cannot lose a field; the hermetic e2e app does
 * the same. The result was that every user loaded from Postgres came back with
 * `emailVerifiedAt: undefined` -> normalised to null -> UNVERIFIED, so the very
 * first real login after deploy would have been a 403 for every account on the
 * platform, backfill or no backfill.
 *
 * That whole class of bug — a column the mapper forgets — is invisible to every
 * test that does not go through Postgres. This one does.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserEntity } from "../../../core/entity/user/user-entity.js";
import { DrizzleUserRepository } from "./repositories/user.repository.js";
import { db } from "./index.js";
import { users } from "./schema.js";

const SUITE_TAG = `email-verified-mapping-${Date.now()}`;

const repository = new DrizzleUserRepository();

function buildUser(suffix: string, emailVerifiedAt: Date | null): UserEntity {
  return UserEntity.create({
    email: `${SUITE_TAG}-${suffix}@example.test`,
    login: `${SUITE_TAG}-${suffix}`,
    name: "Email Verified Mapping",
    password: "not-a-real-password-hash",
    description: null,
    avatarUrl: null,
    emailVerifiedAt,
    googleId: null,
  });
}

async function cleanUp() {
  await db.delete(users).where(eq(users.name, "Email Verified Mapping"));
}

describe("DrizzleUserRepository — email_verified_at mapping", () => {
  beforeAll(cleanUp);
  afterAll(cleanUp);

  it("persists and reads back a verified account", async () => {
    const verifiedAt = new Date("2026-03-04T05:06:07.000Z");

    const created = await repository.create(buildUser("verified", verifiedAt));

    // The value must survive `create`'s own returning-row mapping...
    expect(created.emailVerifiedAt).toEqual(verifiedAt);
    expect(created.isEmailVerified()).toBe(true);

    // ...and every read path, since each one has its own hand-written mapping.
    for (const found of [
      await repository.findById(created.id),
      await repository.findByEmail(created.email),
      await repository.findByLogin(created.login),
      await repository.findByEmailOrLogin(created.email),
    ]) {
      expect(found?.emailVerifiedAt).toEqual(verifiedAt);
      expect(found?.isEmailVerified()).toBe(true);
    }
  });

  it("keeps an unverified account unverified", async () => {
    const created = await repository.create(buildUser("unverified", null));

    const found = await repository.findById(created.id);

    expect(found?.emailVerifiedAt).toBeNull();
    expect(found?.isEmailVerified()).toBe(false);
  });

  it("persists the flip from unverified to verified", async () => {
    const created = await repository.create(buildUser("flip", null));

    created.markEmailVerified(new Date("2026-04-05T06:07:08.000Z"));
    const updated = await repository.update(created);

    // `update` maps in both directions too: the `set` payload and the returned
    // row. Omitting the column from either one loses the verification silently
    // and the user is refused at their next login.
    expect(updated.emailVerifiedAt).toEqual(
      new Date("2026-04-05T06:07:08.000Z"),
    );
    expect((await repository.findById(created.id))?.isEmailVerified()).toBe(
      true,
    );
  });

  it("does not un-verify an account on an unrelated update", async () => {
    const verifiedAt = new Date("2026-05-06T07:08:09.000Z");
    const created = await repository.create(buildUser("unrelated", verifiedAt));

    created.updateLocation("Porto Alegre");
    await repository.update(created);

    // The realistic shape of the regression: someone edits their profile and is
    // quietly logged out of the product forever.
    const found = await repository.findById(created.id);
    expect(found?.emailVerifiedAt).toEqual(verifiedAt);
  });
});
