import { FastifyInstance } from "fastify";
import { ActivityController } from "../controllers/activity/activity-controller.js";

export const activityRoutes = (server: FastifyInstance) => {
  ActivityController.handle(server);
};
