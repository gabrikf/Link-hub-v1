/**
 * Round-trip of `users.persona_other` through the Drizzle repository.
 * NEEDS REAL POSTGRES — `bash db-manage.sh start` — hence the `.e2e.test.ts`
 * name, matching the other files here that cannot run without infrastructure.
 *
 * WHY THIS FILE EXISTS: `DrizzleUserRepository` maps its columns by hand, in
 * nine separate object literals. Every other test of the profile feature runs
 * against the in-memory repository or the hermetic e2e app, both of which store
 * the entity OBJECT and therefore cannot lose a field — which is exactly how
 * `email_verified_at` once shipped absent from the mapper with a green suite
 * (see `user-email-verified-mapping.e2e.test.ts`). A custom role label that
 * saves fine, reads back null and quietly renders as "Other" is the same bug
 * wearing a different name, and only a test that goes through Postgres sees it.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserEntity } from "../../../core/entity/user/user-entity.js";
import { DrizzleUserRepository } from "./repositories/user.repository.js";
import { db } from "./index.js";
import { users } from "./schema.js";

const SUITE_TAG = `persona-other-mapping-${Date.now()}`;
const SUITE_NAME = "Persona Other Mapping";

const repository = new DrizzleUserRepository();

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

describe("DrizzleUserRepository — persona_other mapping", () => {
  beforeAll(cleanUp);
  afterAll(cleanUp);

  it("persists a custom role label and reads it back on every lookup", async () => {
    const created = await repository.create(buildUser("custom"));

    created.updatePersona("other");
    created.updatePersonaOther("Fisioterapeuta");
    const updated = await repository.update(created);

    // It must survive `update`'s own returning-row mapping…
    expect(updated.personaOther).toBe("Fisioterapeuta");

    // …and each of the read paths the profile endpoints actually use.
    const byId = await repository.findById(created.id);
    expect(byId?.persona).toBe("other");
    expect(byId?.personaOther).toBe("Fisioterapeuta");

    const byLogin = await repository.findByLogin(created.login);
    expect(byLogin?.personaOther).toBe("Fisioterapeuta");

    const byEmail = await repository.findByEmail(created.email);
    expect(byEmail?.personaOther).toBe("Fisioterapeuta");
  });

  it("clears the stored label rather than leaving it behind", async () => {
    const created = await repository.create(buildUser("cleared"));

    created.updatePersona("other");
    created.updatePersonaOther("Fisioterapeuta");
    await repository.update(created);

    created.updatePersona("developer");
    created.updatePersonaOther(null);
    await repository.update(created);

    const reread = await repository.findById(created.id);
    expect(reread?.persona).toBe("developer");
    expect(reread?.personaOther).toBeNull();
  });

  it("reads a row that never had a label as null, not undefined", async () => {
    const created = await repository.create(buildUser("never-set"));

    const reread = await repository.findById(created.id);
    expect(reread?.personaOther).toBeNull();
  });
});
