/**
 * The blocklist, over the wire, on both paths that can claim a username.
 *
 * `packages/schemas/src/reserved-usernames/reserved-usernames.test.ts` proves
 * the schemas reject the names. That is not the same claim as this one: a
 * refinement is only enforcement if the route actually validates the body with
 * it, and a controller that takes an inline zod object instead — or a route
 * that validates a different schema than the one that grew the rule — passes
 * the schema test and ships the hole. These drive the real routes.
 *
 * Why it matters at all: `/:username` is now the ONLY public profile URL. A
 * user who owns `dashboard` has a profile that can never be opened, because
 * `/dashboard` is the app. That is not a cosmetic collision — it is an account
 * with no reachable public page, and nothing in the product would ever tell
 * them.
 *
 * Hermetic: `buildTestApp()` — in-memory repositories, real zod validation,
 * real guards, real error handler. No database.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("reserved usernames", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const register = (login: string) =>
    ctx.app.inject({
      method: "POST",
      url: "/register",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        email: `${login.replace(/[^a-z0-9]/gi, "")}@example.com`,
        login,
        name: "Someone",
        password: "password123",
      }),
    });

  async function authed(login: string) {
    const user = await ctx.seedUser({ login });
    const token = await ctx.signJwt(user.id);
    return { user, auth: { authorization: `Bearer ${token}` } };
  }

  const rename = (auth: Record<string, string>, username: string) =>
    ctx.app.inject({
      method: "PUT",
      url: "/profile",
      headers: { ...JSON_HEADERS, ...auth },
      body: JSON.stringify({ username }),
    });

  describe("a NEW registration", () => {
    it.each(["dashboard", "settings", "login", "admin", "verify-email"])(
      "cannot take %s",
      async (login) => {
        const response = await register(login);

        expect(response.statusCode).toBe(400);
        // …and no account was created, which is the part that actually
        // matters: a 400 with a row behind it is not a rejection.
        expect(await ctx.usersRepository.findByLogin(login)).toBeNull();
      },
    );

    /**
     * `users.login` is compared with `=`, so Postgres would happily store
     * `Dashboard` alongside `dashboard` — while the router resolves `/Dashboard`
     * to the `/dashboard` route regardless of case. A case-sensitive blocklist
     * would let exactly this through.
     */
    it("cannot take a differently-cased reserved name either", async () => {
      const response = await register("DashBoard");

      expect(response.statusCode).toBe(400);
      expect(await ctx.usersRepository.findByLogin("DashBoard")).toBeNull();
    });

    it("still accepts an ordinary login", async () => {
      const response = await register("ada");

      expect(response.statusCode).toBe(201);
      expect(await ctx.usersRepository.findByLogin("ada")).not.toBeNull();
    });
  });

  describe("an EXISTING user", () => {
    /**
     * The bypass a registration-only blocklist leaves wide open: sign up as
     * `ana`, rename to `dashboard` a minute later. This is why the refinement
     * is on `updateProfileSchemaInput` too and not only on the signup schema.
     */
    it.each(["dashboard", "ADMIN", "support"])(
      "cannot rename into %s",
      async (username) => {
        const { user, auth } = await authed("ana");

        const response = await rename(auth, username);

        expect(response.statusCode).toBe(400);
        // The stored login is untouched — the rejection happened before the
        // use case, not after a partial write.
        const stored = await ctx.usersRepository.findById(user.id);
        expect(stored?.login).toBe("ana");
      },
    );

    it("can still rename to an ordinary name", async () => {
      const { user, auth } = await authed("ana");

      const response = await rename(auth, "ana-lovelace");

      expect(response.statusCode).toBe(200);
      const stored = await ctx.usersRepository.findById(user.id);
      expect(stored?.login).toBe("ana-lovelace");
    });
  });
});
