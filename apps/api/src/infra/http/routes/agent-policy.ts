import { FastifyInstance } from "fastify";
import { AgentPolicyController } from "../controllers/agent-policy/agent-policy-controller.js";

export const agentPolicyRoutes = (server: FastifyInstance) => {
  AgentPolicyController.handle(server);
};
