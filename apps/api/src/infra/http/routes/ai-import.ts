import { FastifyInstance } from "fastify";
import { AiImportController } from "../controllers/ai-import/ai-import-controller.js";

export const aiImportRoutes = (server: FastifyInstance) => {
  AiImportController.handle(server);
};
