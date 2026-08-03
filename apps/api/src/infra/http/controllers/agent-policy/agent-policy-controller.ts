import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
  agentDisclosureLevelSchema,
  agentPolicySchema,
  updateAgentPolicyInputSchema,
  type UpdateAgentPolicyInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { apiAccessGuard } from "../../middleware/api-access-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { GetAgentPolicyUseCase } from "../../../../core/use-case/agent-policy/get-agent-policy-use-case/get-agent-policy.use-case.js";
import { UpdateAgentPolicyUseCase } from "../../../../core/use-case/agent-policy/update-agent-policy-use-case/update-agent-policy.use-case.js";
import { GetWorkContextUseCase } from "../../../../core/use-case/agent-policy/get-work-context-use-case/get-work-context.use-case.js";

/**
 * Response shape of `GET /me/work-context` — the redacted view of work history.
 *
 * Declared here rather than in @repo/schemas because it is a projection built
 * for one consumer (the MCP server), not a domain model shared by the app.
 */
const workContextRoleSchema = z.object({
  id: z.string(),
  title: z.string(),
  seniorityHint: z.string().nullable(),
  employmentType: z.string().nullable(),
  workModel: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  isCurrent: z.boolean(),
  durationMonths: z.number().nullable(),
  stack: z.array(z.string()),
  practices: z.array(z.string()),
  domain: z.string().nullable(),
  /** Null at `summary` level — that is the whole point of the level. */
  companyName: z.string().nullable(),
  achievements: z.array(z.string()),
});

const workContextSchema = z.object({
  disclosureLevel: agentDisclosureLevelSchema,
  roles: z.array(workContextRoleSchema),
});

export class AgentPolicyController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/agent-policy",
      {
        // Readable by an agent so it can tell the user what it may and may not
        // say — but see the PATCH below: reading is not permission to change.
        preHandler: apiAccessGuard("profile:read"),
        schema: {
          tags: ["Agent Policy"],
          summary: "Get the disclosure policy in force for the current user",
          response: {
            200: agentPolicySchema,
            ...commonErrorResponses([
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const getAgentPolicyUseCase = resolve<GetAgentPolicyUseCase>(
          TOKENS.GetAgentPolicyUseCase,
        );

        const result = await getAgentPolicyUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.patch(
      "/me/agent-policy",
      {
        // `authGuard`, NOT `apiAccessGuard`: a PAT must never be able to widen
        // the policy that constrains it. Only the human, in a real session.
        preHandler: authGuard,
        schema: {
          tags: ["Agent Policy"],
          summary: "Update the disclosure policy (human sessions only)",
          body: updateAgentPolicyInputSchema,
          response: {
            200: agentPolicySchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Body: UpdateAgentPolicyInput }>,
        reply,
      ) => {
        const updateAgentPolicyUseCase = resolve<UpdateAgentPolicyUseCase>(
          TOKENS.UpdateAgentPolicyUseCase,
        );

        const result = await updateAgentPolicyUseCase.execute({
          userId: request.user!.id,
          disclosureLevel: request.body.disclosureLevel,
          blockedTerms: request.body.blockedTerms,
        });

        reply.status(200).send(result);
      },
    );

    app.get(
      "/me/work-context",
      {
        preHandler: apiAccessGuard("profile:read"),
        schema: {
          tags: ["Agent Policy"],
          summary:
            "Get work history already redacted to the effective disclosure level",
          response: {
            200: workContextSchema,
            ...commonErrorResponses([
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const getWorkContextUseCase = resolve<GetWorkContextUseCase>(
          TOKENS.GetWorkContextUseCase,
        );

        const result = await getWorkContextUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );
  }
}
