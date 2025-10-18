import { FastifyInstance } from "fastify";
import { CreateUserController } from "../controllers/auth/create-user-controller.js";
import { LoginController } from "../controllers/auth/login-controller.js";

export const authRoutes = (server: FastifyInstance) => {
  CreateUserController.handle(server);
  LoginController.handle(server);
};
