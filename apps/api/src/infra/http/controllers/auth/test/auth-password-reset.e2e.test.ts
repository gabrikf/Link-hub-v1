/**
 * E2E tests for `POST /auth/forgot-password` and `POST /auth/reset-password`.
 *
 * These target the ways a reset flow is quietly dangerous rather than merely
 * broken: an endpoint that reveals which addresses have accounts, a link that
 * works twice, a reset that leaves the attacker's session alive, and a reset
 * that hands out a session of its own.
 *
 * Runs against the DB-free app from `buildTestApp()` — real zod schemas, real
 * controllers, real global error handler.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  forgotPasswordSchemaOutput,
  loginSchemaOutput,
  resetPasswordSchemaOutput,
} from "@repo/schemas";
import {
  buildTestApp,
  TEST_APP_PUBLIC_URL,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

const ACCOUNT = {
  email: "forgetful@example.com",
  login: "forgetful",
  password: "old-password",
};

const NEW_PASSWORD = "brand-new-password";

describe("Auth password reset E2E", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const post = (url: string, payload: Record<string, unknown>) =>
    ctx.app.inject({ method: "POST", url, headers: JSON_HEADERS, payload });

  /** A verified account whose stored hash matches ACCOUNT.password. */
  async function seedAccount() {
    return ctx.seedUser({
      email: ACCOUNT.email,
      login: ACCOUNT.login,
      password: await ctx.hashProvider.hash(ACCOUNT.password),
    });
  }

  function resetTokenFromLastEmail(): string {
    const message = ctx.mailProvider.lastMessage();
    expect(message).not.toBeNull();

    const link = message!.text
      .split("\n")
      .find((line) => line.startsWith(`${TEST_APP_PUBLIC_URL}/reset-password`));

    expect(link).toBeDefined();

    return new URL(link!).searchParams.get("token")!;
  }

  describe("POST /forgot-password", () => {
    it("emails a reset link and answers the shared schema's shape", async () => {
      await seedAccount();

      const response = await post("/forgot-password", {
        email: ACCOUNT.email,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "sent" });
      // Contract test on a REAL captured payload.
      expect(() =>
        forgotPasswordSchemaOutput.parse(response.json()),
      ).not.toThrow();

      expect(ctx.mailProvider.sent).toHaveLength(1);
      expect(ctx.mailProvider.lastMessage()?.to).toBe(ACCOUNT.email);
      expect(ctx.passwordResetTokenRepository.count()).toBe(1);
    });

    it("answers a known and an unknown address IDENTICALLY", async () => {
      await seedAccount();

      const known = await post("/forgot-password", { email: ACCOUNT.email });

      const fresh = await buildTestApp();
      const unknown = await fresh.app.inject({
        method: "POST",
        url: "/forgot-password",
        headers: JSON_HEADERS,
        payload: { email: "nobody-at-all@example.com" },
      });

      // Byte-identical, status and body. Any difference here — a code, a
      // message, even a field order — is a free tool for discovering who has an
      // account on this platform.
      expect(unknown.statusCode).toBe(known.statusCode);
      expect(unknown.body).toBe(known.body);

      // ...and nothing was sent to the address that has no account.
      expect(fresh.mailProvider.sent).toHaveLength(0);

      await fresh.app.close();
    });

    it("serves an OAuth-only account too", async () => {
      // Documented decision: the token proves control of the same mailbox the
      // provider vouched for, so this is the "add a password to my social
      // login" flow rather than a hole. Refusing would also have to be visible
      // in the response to be useful, which would leak account existence.
      await ctx.seedUser({
        email: "google-user@example.com",
        login: "google-user",
      });

      const response = await post("/forgot-password", {
        email: "google-user@example.com",
      });

      expect(response.statusCode).toBe(200);
      expect(ctx.mailProvider.sent).toHaveLength(1);
    });

    it("answers 'sent' while cooling down, without sending a second email", async () => {
      await seedAccount();

      await post("/forgot-password", { email: ACCOUNT.email });
      const second = await post("/forgot-password", { email: ACCOUNT.email });

      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual({ status: "sent" });
      // A caller looping this endpoint cannot turn it into a mail cannon
      // pointed at someone else's inbox.
      expect(ctx.mailProvider.sent).toHaveLength(1);
    });

    it("rejects a malformed address at the schema", async () => {
      const response = await post("/forgot-password", { email: "nope" });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /reset-password", () => {
    async function requestReset() {
      await seedAccount();
      await post("/forgot-password", { email: ACCOUNT.email });
      return resetTokenFromLastEmail();
    }

    it("sets the new password and returns NO session", async () => {
      const token = await requestReset();

      const response = await post("/reset-password", {
        token,
        password: NEW_PASSWORD,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "reset" });
      expect(() =>
        resetPasswordSchemaOutput.parse(response.json()),
      ).not.toThrow();

      // Returning tokens here would make a forwarded email an authenticated
      // session — and would re-arm an attacker we just revoked.
      expect(response.json()).not.toHaveProperty("accessToken");
      expect(response.json()).not.toHaveProperty("refreshToken");
    });

    it("lets the user sign in with the new password, and not the old one", async () => {
      const token = await requestReset();
      await post("/reset-password", { token, password: NEW_PASSWORD });

      const withNew = await post("/login", {
        email: ACCOUNT.email,
        password: NEW_PASSWORD,
      });
      expect(withNew.statusCode).toBe(200);
      expect(() => loginSchemaOutput.parse(withNew.json())).not.toThrow();

      const withOld = await post("/login", {
        email: ACCOUNT.email,
        password: ACCOUNT.password,
      });
      expect(withOld.statusCode).toBe(401);
    });

    it("revokes an existing session, so a stolen refresh token dies", async () => {
      await seedAccount();

      const signedIn = await post("/login", {
        email: ACCOUNT.email,
        password: ACCOUNT.password,
      });
      const stolenRefreshToken = signedIn.json().refreshToken;

      await post("/forgot-password", { email: ACCOUNT.email });
      await post("/reset-password", {
        token: resetTokenFromLastEmail(),
        password: NEW_PASSWORD,
      });

      // The point of the whole feature: the intruder holding this token can no
      // longer mint access tokens.
      const refreshed = await post("/refresh", {
        refreshToken: stolenRefreshToken,
      });
      expect(refreshed.statusCode).toBe(401);
      expect(ctx.refreshTokenRepository.count()).toBe(0);
    });

    it("rejects a replayed link with 400 INVALID_RESET_TOKEN", async () => {
      const token = await requestReset();

      await post("/reset-password", { token, password: NEW_PASSWORD });
      const replay = await post("/reset-password", {
        token,
        password: "yet-another-password",
      });

      expect(replay.statusCode).toBe(400);
      expect(replay.json().code).toBe("INVALID_RESET_TOKEN");

      // The replay changed nothing — the first reset still stands.
      const login = await post("/login", {
        email: ACCOUNT.email,
        password: NEW_PASSWORD,
      });
      expect(login.statusCode).toBe(200);
    });

    it("answers an unknown token identically to a replayed one", async () => {
      const token = await requestReset();
      await post("/reset-password", { token, password: NEW_PASSWORD });

      const replayed = await post("/reset-password", {
        token,
        password: NEW_PASSWORD,
      });
      const unknown = await post("/reset-password", {
        token: "not-a-real-token",
        password: NEW_PASSWORD,
      });

      expect(unknown.statusCode).toBe(replayed.statusCode);
      expect(unknown.json().message).toBe(replayed.json().message);
      expect(unknown.json().code).toBe(replayed.json().code);
    });

    it("clears the verification wall for an account that never confirmed", async () => {
      // Register the normal way: unverified, and refused at login.
      await post("/register", {
        email: "never-confirmed@example.com",
        login: "neverconfirmed",
        name: "Never Confirmed",
        password: "first-password",
      });

      await post("/forgot-password", { email: "never-confirmed@example.com" });
      await post("/reset-password", {
        token: resetTokenFromLastEmail(),
        password: NEW_PASSWORD,
      });

      // Opening the reset link proved the mailbox, so leaving them behind the
      // verification gate would be a dead end with no way out.
      const login = await post("/login", {
        email: "never-confirmed@example.com",
        password: NEW_PASSWORD,
      });

      expect(login.statusCode).toBe(200);
      expect(login.json().user.emailVerified).toBe(true);
    });

    it("rejects a password below the signup minimum, at the schema", async () => {
      const token = await requestReset();

      const response = await post("/reset-password", {
        token,
        password: "12345",
      });

      // The SAME policy as registration: a reset form accepting a weaker
      // password than signup would be a downgrade path.
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    });

    it("rejects an empty token at the schema, before any lookup", async () => {
      const response = await post("/reset-password", {
        token: "",
        password: NEW_PASSWORD,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    });
  });

  describe("dual mount", () => {
    it("serves the same flow under /api/v1", async () => {
      await seedAccount();

      const requested = await post("/api/v1/forgot-password", {
        email: ACCOUNT.email,
      });
      expect(requested.statusCode).toBe(200);

      const reset = await post("/api/v1/reset-password", {
        token: resetTokenFromLastEmail(),
        password: NEW_PASSWORD,
      });
      expect(reset.statusCode).toBe(200);
    });
  });
});
