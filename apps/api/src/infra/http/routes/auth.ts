import { FastifyInstance } from "fastify";
import { CreateUserController } from "../controllers/auth/create-user-controller.js";
import { LoginController } from "../controllers/auth/login-controller.js";
import { GoogleSignInController } from "../controllers/auth/google-sign-in-controller.js";
import { LinkedInSignInController } from "../controllers/auth/linkedin-sign-in-controller.js";

export const authRoutes = (server: FastifyInstance) => {
  CreateUserController.handle(server);
  LoginController.handle(server);
  GoogleSignInController.handle(server);
  LinkedInSignInController.handle(server);
};
