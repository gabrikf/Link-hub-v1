/**
 * E2E tests for `GET`/`PUT /preferences`.
 *
 * These target the four ways this endpoint can be quietly wrong: a user whose
 * row predates the table 500s instead of getting defaults, an unknown locale is
 * coerced to the default instead of rejected, a partial save wipes the field it
 * did not mention, and the whole thing answers to a request with no token.
 *
 * Runs against the DB-free app from `buildTestApp()`: the real auth guard, the
 * real zod validation and the real global error handler all execute.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { userPreferencesSchema } from "@repo/schemas";
import { errorHandler } from "../../../middleware/global-error-handler.js";
import { preferencesRoutes } from "../../../routes/preferences.js";
import {
  buildTestApp,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

describe("Preferences E2E", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function authed() {
    const user = await ctx.seedUser();
    const token = await ctx.signJwt(user.id);
    return { user, token, auth: { authorization: `Bearer ${token}` } };
  }

  describe("GET /preferences", () => {
    it("returns follow-the-device defaults for a user with no preferences row", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
        headers: auth,
      });

      // The specific regression: an account created before the migration (or by
      // a signup path that forgot to write the row) hitting a 500 on the first
      // request after login, before the user has done anything at all.
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ language: null, theme: "system" });
    });

    it("answers a shape the shared schema accepts", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
        headers: auth,
      });

      expect(() => userPreferencesSchema.parse(response.json())).not.toThrow();
    });

    it("reads back what was saved", async () => {
      const { auth } = await authed();

      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: "pt-BR", theme: "dark" }),
      });

      const response = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
        headers: auth,
      });

      expect(response.json()).toEqual({ language: "pt-BR", theme: "dark" });
    });

    it("serves the same answer bare and under the /api/v1 prefix", async () => {
      /*
       * Every module in this repo is mounted twice, and `routes/index.ts`
       * mounts this one the same way. What that double registration can break
       * is the module itself — a route declared with an absolute path, or one
       * that cannot be registered twice in the same instance — so mount the
       * real route plugin both ways here and drive both paths.
       */
      const { auth } = await authed();

      const dualMounted = fastify();
      dualMounted.setErrorHandler(errorHandler);
      dualMounted.setValidatorCompiler(validatorCompiler);
      dualMounted.setSerializerCompiler(serializerCompiler);
      await dualMounted.register(preferencesRoutes);
      await dualMounted.register(preferencesRoutes, { prefix: "/api/v1" });
      await dualMounted.ready();

      try {
        const bare = await dualMounted.inject({
          method: "GET",
          url: "/preferences",
          headers: auth,
        });
        const prefixed = await dualMounted.inject({
          method: "GET",
          url: "/api/v1/preferences",
          headers: auth,
        });

        expect(bare.statusCode).toBe(200);
        expect(prefixed.statusCode).toBe(200);
        expect(prefixed.json()).toEqual(bare.json());
      } finally {
        await dualMounted.close();
      }
    });
  });

  describe("PUT /preferences", () => {
    it("rejects an unknown locale with 400 rather than coercing it", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: "xx-XX" }),
      });

      expect(response.statusCode).toBe(400);

      // A silent coercion to the default is indistinguishable from a save that
      // did not happen, so assert nothing was written either.
      const after = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
        headers: auth,
      });
      expect(after.json()).toEqual({ language: null, theme: "system" });
    });

    it("rejects an unknown theme with 400 rather than 500", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ theme: "sepia" }),
      });

      expect(response.statusCode).toBe(400);
    });

    it("rejects an empty body with 400", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({}),
      });

      // A `{}` that returns 200 tells the client the save succeeded when
      // nothing was asked for and nothing happened.
      expect(response.statusCode).toBe(400);
    });

    it("returns the full new state after a partial update", async () => {
      const { auth } = await authed();

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ theme: "light" }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ language: null, theme: "light" });
    });

    it("leaves language untouched when only theme is sent", async () => {
      const { auth } = await authed();

      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: "es-ES", theme: "dark" }),
      });

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ theme: "light" }),
      });

      expect(response.json()).toEqual({ language: "es-ES", theme: "light" });
    });

    it("accepts an explicit null language as 'follow the device'", async () => {
      const { auth } = await authed();

      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: "pt-BR" }),
      });

      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...auth },
        body: JSON.stringify({ language: null }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ language: null, theme: "system" });
    });

    it("cannot change another user's preferences", async () => {
      const owner = await authed();
      const intruder = await authed();

      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...owner.auth },
        body: JSON.stringify({ language: "pt-BR" }),
      });

      await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: { ...JSON_HEADERS, ...intruder.auth },
        body: JSON.stringify({ language: "es-ES" }),
      });

      const ownerAfter = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
        headers: owner.auth,
      });
      expect(ownerAfter.json().language).toBe("pt-BR");
    });
  });

  describe("auth", () => {
    it("rejects GET without a token", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects PUT without a token", async () => {
      const response = await ctx.app.inject({
        method: "PUT",
        url: "/preferences",
        headers: JSON_HEADERS,
        body: JSON.stringify({ theme: "dark" }),
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects a token that was not signed by this server", async () => {
      const response = await ctx.app.inject({
        method: "GET",
        url: "/preferences",
        headers: { authorization: "Bearer not-a-real-token" },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
