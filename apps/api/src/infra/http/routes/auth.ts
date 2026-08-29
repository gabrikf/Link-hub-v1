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

export const authRoutes = (server: FastifyInstance) => {
  CreateUserController.handle(server);
  LoginController.handle(server);
  GoogleSignInController.handle(server);
  LinkedInSignInController.handle(server);
  VerifyEmailController.handle(server);
  ResendVerificationController.handle(server);
  // `POST /auth/refresh`. Registered here means it is mounted twice, bare and
  // under /api/v1, like every other module — the web client builds its URL from
  // whichever base it was configured with, so both have to answer.
  RefreshSessionController.handle(server);
  ForgotPasswordController.handle(server);
  ResetPasswordController.handle(server);
};
