import { FastifyInstance } from "fastify";
import { LinksController } from "../controllers/links/links-controller.js";

export const linksRoutes = (server: FastifyInstance) => {
  LinksController.handle(server);
};
