import { FastifyInstance } from "fastify";
import { CreateUserController } from "../controllers/auth/create-user-controller.js";
import { LoginController } from "../controllers/auth/login-controller.js";
import { GoogleSignInController } from "../controllers/auth/google-sign-in-controller.js";
import { LinkedInSignInController } from "../controllers/auth/linkedin-sign-in-controller.js";
import { VerifyEmailController } from "../controllers/auth/verify-email-controller.js";
import { ResendVerificationController } from "../controllers/auth/resend-verification-controller.js";
import { RefreshSessionController } from "../controllers/auth/refresh-session-controller.js";
import { ForgotPasswordController } from "../controllers/auth/forgot-password-controller.js";
import { ResetPasswordController } from "../controllers/auth/reset-password-controller.js";

/**
 * Every `Controller.handle` here is declared `static async` but never awaits
 * anything before it finishes registering its routes — the handler functions
 * passed to `app.post`/`app.get` run later, per request, not during
 * registration. The returned promise is therefore always already resolved by
 * the time `handle` returns, and `authRoutes` itself must stay a plain (not
 * `async`) function: it is called directly, unawaited, from
 * `test-support/build-test-app.ts` as well as registered as a Fastify plugin
 * here, so making it async would turn that direct call into a floating
 * promise the caller does not own. `void` plus a logged `.catch()` records
 * the (never expected) case where registering routes itself throws, without
 * asking every caller to become async.
 */
function registerAuthController(
  server: FastifyInstance,
  handle: (server: FastifyInstance) => Promise<void>,
): void {
  void handle(server).catch((error: unknown) => {
    server.log.error(error, "Failed to register an auth route");
  });
}

export const authRoutes = (server: FastifyInstance) => {
  registerAuthController(server, (s) => CreateUserController.handle(s));
  registerAuthController(server, (s) => LoginController.handle(s));
  registerAuthController(server, (s) => GoogleSignInController.handle(s));
  registerAuthController(server, (s) => LinkedInSignInController.handle(s));
  registerAuthController(server, (s) => VerifyEmailController.handle(s));
  registerAuthController(server, (s) => ResendVerificationController.handle(s));
  // `POST /auth/refresh`. Registered here means it is mounted twice, bare and
  // under /api/v1, like every other module — the web client builds its URL from
  // whichever base it was configured with, so both have to answer.
  registerAuthController(server, (s) => RefreshSessionController.handle(s));
  registerAuthController(server, (s) => ForgotPasswordController.handle(s));
  registerAuthController(server, (s) => ResetPasswordController.handle(s));
};
