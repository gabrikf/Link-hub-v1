import { FastifyInstance } from "fastify";
import { UploadsController } from "../controllers/uploads/uploads-controller.js";

export const uploadsRoutes = (server: FastifyInstance) => {
  UploadsController.handle(server);
};
