import { FastifyInstance } from "fastify";
import { ResumeController } from "../controllers/resume/resume-controller.js";

export const resumeRoutes = (server: FastifyInstance) => {
  ResumeController.handle(server);
};
