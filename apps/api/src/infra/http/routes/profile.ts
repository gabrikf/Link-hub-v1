import { FastifyInstance } from "fastify";
import { ProfileController } from "../controllers/profile/profile-controller.js";

export const profileRoutes = (server: FastifyInstance) => {
  ProfileController.handle(server);
};
