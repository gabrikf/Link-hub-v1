import { FastifyInstance } from "fastify";
import { ApiTokensController } from "../controllers/api-tokens/api-tokens-controller.js";

export const apiTokensRoutes = (server: FastifyInstance) => {
  ApiTokensController.handle(server);
};
