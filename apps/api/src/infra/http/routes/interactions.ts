import { FastifyInstance } from "fastify";
import { InteractionsController } from "../controllers/interactions/interactions-controller.js";

export const interactionsRoutes = (server: FastifyInstance) => {
  InteractionsController.handle(server);
};
