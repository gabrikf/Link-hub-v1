/**
 * Round-trip of `users.profile_appearance` through the Drizzle repository.
 * NEEDS REAL POSTGRES — `bash db-manage.sh start` — hence the `.e2e.test.ts`
 * name, matching the other files here that cannot run without infrastructure.
 *
 * WHY THIS FILE EXISTS: `DrizzleUserRepository` maps its columns by hand, in
 * nine separate object literals, and this is the tenth column to be added to
 * all of them. Every other test of the appearance feature runs against the
 * in-memory repository or the hermetic e2e app, both of which store the entity
 * OBJECT and therefore cannot lose a field — which is exactly how
 * `email_verified_at` once shipped absent from the mapper with a green suite.
 * A banner position that saves fine, reads back null and quietly re-centres the
 * owner's face is the same bug wearing a different name, and only a test that
 * goes through Postgres sees it.
 *
 * It also covers the one thing a jsonb column can do that a `text` column
 * cannot: hold something that is not the shape we expect.
 */
import { DEFAULT_PROFILE_APPEARANCE } from "@repo/schemas";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserEntity } from "../../../core/entity/user/user-entity.js";
import { DrizzleUserRepository } from "./repositories/user.repository.js";
import { db } from "./index.js";
import { users } from "./schema.js";

const SUITE_TAG = `appearance-mapping-${Date.now()}`;
const SUITE_NAME = "Appearance Mapping";

const repository = new DrizzleUserRepository();

const APPEARANCE = {
  bannerPlacement: { x: 50, y: 18, scale: 1.2 },
  backgroundPlacement: { x: 25, y: 70, scale: 1 },
  backgroundOverlay: 30,
  backgroundBlur: 12,
};

function buildUser(suffix: string): UserEntity {
  return UserEntity.create({
    email: `${SUITE_TAG}-${suffix}@example.test`,
    login: `${SUITE_TAG}-${suffix}`,
    name: SUITE_NAME,
    password: "not-a-real-password-hash",
    description: null,
    avatarUrl: null,
    googleId: null,
  });
}

async function cleanUp() {
  await db.delete(users).where(eq(users.name, SUITE_NAME));
}

describe("DrizzleUserRepository — profile_appearance mapping", () => {
  beforeAll(cleanUp);
  afterAll(cleanUp);

  it("persists a placement and reads it back on every lookup", async () => {
    const created = await repository.create(buildUser("placed"));

    created.updateAppearance(APPEARANCE);
    const updated = await repository.update(created);

    // It must survive `update`'s own returning-row mapping…
    expect(updated.appearance).toEqual(APPEARANCE);

    // …and each of the read paths the profile endpoints actually use.
    const byId = await repository.findById(created.id);
    expect(byId?.appearance).toEqual(APPEARANCE);

    const byLogin = await repository.findByLogin(created.login);
    expect(byLogin?.appearance).toEqual(APPEARANCE);

    const byEmail = await repository.findByEmail(created.email);
    expect(byEmail?.appearance).toEqual(APPEARANCE);
  });

  it("reads a row that never had one as the documented default", async () => {
    const created = await repository.create(buildUser("never-set"));

    const reread = await repository.findById(created.id);
    expect(reread?.appearance).toEqual(DEFAULT_PROFILE_APPEARANCE);
  });

  it("survives a row holding something that is not an appearance", async () => {
    // jsonb accepts anything; a migration, a support script or a hand-edit can
    // put garbage here, and a profile page must still render.
    const created = await repository.create(buildUser("garbage"));
    await db
      .update(users)
      .set({ profileAppearance: { backgroundOverlay: "quite a lot" } })
      .where(eq(users.id, created.id));

    const reread = await repository.findById(created.id);
    expect(reread?.appearance).toEqual(DEFAULT_PROFILE_APPEARANCE);
  });
});
