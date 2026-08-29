/**
 * E2E tests for the password-signup lifecycle:
 * `POST /register` -> email -> `POST /verify-email` -> `POST /login`, plus
 * `POST /resend-verification`.
 *
 * These target the ways the flow can be quietly wrong end to end: registration
 * still handing out a session, the verification link not actually arriving,
 * a used link working twice, an unverified account being let in anyway, and
 * the resend endpoint answering differently for an address that exists.
 *
 * Runs against the DB-free app from `buildTestApp()` — the real zod schemas,
 * the real controllers and the real global error handler all execute, which is
 * the half the use-case unit tests cannot see.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createUserSchemaOutput,
  loginSchemaOutput,
  resendVerificationSchemaOutput,
  verifyEmailSchemaOutput,
} from "@repo/schemas";
import {
  buildTestApp,
  TEST_APP_PUBLIC_URL,
  type TestAppHandles,
} from "../../../test-support/build-test-app.js";

const JSON_HEADERS = { "content-type": "application/json" };

const SIGNUP = {
  email: "new.dev@example.com",
  login: "newdev",
  name: "New Dev",
  password: "password123",
};

describe("Auth email verification E2E", () => {
  let ctx: TestAppHandles;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  const post = (url: string, payload: Record<string, unknown>) =>
    ctx.app.inject({ method: "POST", url, headers: JSON_HEADERS, payload });

  /** Pull the raw token out of the email the app just "sent". */
  function tokenFromLastEmail(): string {
    const message = ctx.mailProvider.lastMessage();
    expect(message).not.toBeNull();

    const link = message!.text
      .split("\n")
      .find((line) => line.startsWith(TEST_APP_PUBLIC_URL));

    expect(link).toBeDefined();

    const token = new URL(link!).searchParams.get("token");
    expect(token).toBeTruthy();

    return token!;
  }

  describe("POST /register", () => {
    it("creates an unverified account, emails a link and returns NO tokens", async () => {
      const response = await post("/register", SIGNUP);

      expect(response.statusCode).toBe(201);

      const body = response.json();
      expect(body).toEqual({
        user: expect.objectContaining({
          email: SIGNUP.email,
          login: SIGNUP.login,
          emailVerified: false,
        }),
        emailVerificationRequired: true,
      });

      // The regression this guards: shipping a session here would make the
      // whole verification step decorative — the user would already be in.
      expect(body).not.toHaveProperty("accessToken");
      expect(body).not.toHaveProperty("refreshToken");

      expect(ctx.mailProvider.sent).toHaveLength(1);
      expect(ctx.mailProvider.lastMessage()?.to).toBe(SIGNUP.email);
    });

    it("answers a shape the shared schema accepts", async () => {
      const response = await post("/register", SIGNUP);

      // Contract test: a REAL captured payload through @repo/schemas, which is
      // the same object `apps/web` parses.
      expect(() =>
        createUserSchemaOutput.parse(response.json()),
      ).not.toThrow();
    });

    it("still rejects a duplicate email with 409", async () => {
      await post("/register", SIGNUP);
      const response = await post("/register", SIGNUP);

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe("DUPLICATE_RESOURCE");
      // No second email to an address that already has an account.
      expect(ctx.mailProvider.sent).toHaveLength(1);
    });
  });

  describe("POST /login before verification", () => {
    it("refuses the correct password with 403 EMAIL_NOT_VERIFIED", async () => {
      await post("/register", SIGNUP);

      const response = await post("/login", {
        email: SIGNUP.email,
        password: SIGNUP.password,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: "EMAIL_NOT_VERIFIED",
        statusCode: 403,
      });
    });

    it("still answers 401 for a WRONG password on the same unverified account", async () => {
      await post("/register", SIGNUP);

      const response = await post("/login", {
        email: SIGNUP.email,
        password: "not-the-password",
      });

      // Otherwise the 403 would be an account-existence oracle: type any
      // address with junk and see which ones say "verify your email".
      expect(response.statusCode).toBe(401);
    });
  });

  describe("POST /verify-email", () => {
    it("verifies, signs in, and answers the shared schema's shape", async () => {
      await post("/register", SIGNUP);
      const token = tokenFromLastEmail();

      const response = await post("/verify-email", { token });

      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.user.emailVerified).toBe(true);
      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(() => verifyEmailSchemaOutput.parse(body)).not.toThrow();
    });

    it("lets the same account log in afterwards", async () => {
      await post("/register", SIGNUP);
      await post("/verify-email", { token: tokenFromLastEmail() });

      const response = await post("/login", {
        email: SIGNUP.email,
        password: SIGNUP.password,
      });

      expect(response.statusCode).toBe(200);
      expect(() => loginSchemaOutput.parse(response.json())).not.toThrow();
      expect(response.json().user.emailVerified).toBe(true);
    });

    it("rejects a replayed link with 400 INVALID_VERIFICATION_TOKEN", async () => {
      await post("/register", SIGNUP);
      const token = tokenFromLastEmail();

      await post("/verify-email", { token });
      const replay = await post("/verify-email", { token });

      expect(replay.statusCode).toBe(400);
      expect(replay.json().code).toBe("INVALID_VERIFICATION_TOKEN");
    });

    it("answers an unknown token identically to a replayed one", async () => {
      await post("/register", SIGNUP);
      const token = tokenFromLastEmail();
      await post("/verify-email", { token });

      const replayed = await post("/verify-email", { token });
      const unknown = await post("/verify-email", { token: "not-a-real-token" });

      expect(unknown.statusCode).toBe(replayed.statusCode);
      expect(unknown.json().message).toBe(replayed.json().message);
      expect(unknown.json().code).toBe(replayed.json().code);
    });

    it("rejects an empty token at the schema, before any lookup", async () => {
      const response = await post("/verify-email", { token: "" });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /resend-verification", () => {
    it("sends a fresh link that verifies the account", async () => {
      await post("/register", SIGNUP);
      const firstToken = tokenFromLastEmail();

      // Step past the per-email cooldown by ageing the stored token, which is
      // what the cooldown actually reads.
      for (const stored of ctx.emailVerificationTokenRepository.getAll()) {
        stored.createdAt = new Date(Date.now() - 5 * 60 * 1000);
      }

      const response = await post("/resend-verification", {
        email: SIGNUP.email,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "sent" });
      expect(() =>
        resendVerificationSchemaOutput.parse(response.json()),
      ).not.toThrow();

      expect(ctx.mailProvider.sent).toHaveLength(2);

      const secondToken = tokenFromLastEmail();
      expect(secondToken).not.toBe(firstToken);

      const verified = await post("/verify-email", { token: secondToken });
      expect(verified.statusCode).toBe(200);

      // Verifying with the SECOND link kills the first one too — both were
      // sitting in the same inbox.
      const stale = await post("/verify-email", { token: firstToken });
      expect(stale.statusCode).toBe(400);
    });

    it("answers 'sent' for an address with no account, and mails nobody", async () => {
      const response = await post("/resend-verification", {
        email: "stranger@example.com",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "sent" });
      // The whole point: the answer is identical, and no mail is generated.
      expect(ctx.mailProvider.sent).toHaveLength(0);
    });

    it("answers 'sent' for an already-verified account, and mails nobody", async () => {
      await ctx.seedUser({ email: "verified@example.com" });

      const response = await post("/resend-verification", {
        email: "verified@example.com",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "sent" });
      expect(ctx.mailProvider.sent).toHaveLength(0);
    });

    it("answers 'sent' while cooling down, without sending a second email", async () => {
      await post("/register", SIGNUP);

      const response = await post("/resend-verification", {
        email: SIGNUP.email,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "sent" });
      // One email total: the registration one. A caller looping this endpoint
      // cannot turn it into a mail cannon pointed at someone else's inbox.
      expect(ctx.mailProvider.sent).toHaveLength(1);
    });

    it("rejects a malformed address at the schema", async () => {
      const response = await post("/resend-verification", {
        email: "not-an-email",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe("VALIDATION_ERROR");
    });
  });

  describe("dual mount", () => {
    it("serves the same flow under /api/v1", async () => {
      const registered = await post("/api/v1/register", SIGNUP);
      expect(registered.statusCode).toBe(201);

      const verified = await post("/api/v1/verify-email", {
        token: tokenFromLastEmail(),
      });
      expect(verified.statusCode).toBe(200);
    });
  });
});
