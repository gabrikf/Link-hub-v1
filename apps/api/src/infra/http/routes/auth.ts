import { FastifyInstance } from "fastify";
import { CreateUserController } from "../controllers/auth/create-user-controller.js";

export const authRoutes = (server: FastifyInstance) => {
  CreateUserController.handle(server);
};
