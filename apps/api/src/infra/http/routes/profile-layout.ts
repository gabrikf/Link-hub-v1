import { FastifyInstance } from "fastify";
import { ProfileLayoutController } from "../controllers/profile-layout/profile-layout-controller.js";

export const profileLayoutRoutes = (server: FastifyInstance) => {
  ProfileLayoutController.handle(server);
};
