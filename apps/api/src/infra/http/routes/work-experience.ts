import { FastifyInstance } from "fastify";
import { WorkExperienceController } from "../controllers/work-experience/work-experience-controller.js";

export const workExperienceRoutes = (server: FastifyInstance) => {
  WorkExperienceController.handle(server);
};
