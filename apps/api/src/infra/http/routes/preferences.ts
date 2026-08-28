import { FastifyInstance } from "fastify";
import { PreferencesController } from "../controllers/preferences/preferences-controller.js";

export const preferencesRoutes = (server: FastifyInstance) => {
  PreferencesController.handle(server);
};
