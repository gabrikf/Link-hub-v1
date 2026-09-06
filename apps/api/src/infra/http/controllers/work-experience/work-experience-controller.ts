import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
  agentDisclosureLevelSchema,
  createWorkExperienceInputSchema,
  publicWorkExperienceSchema,
  updateWorkExperienceInputSchema,
  usernameParamsSchema,
  workExperienceSchema,
  type CreateWorkExperienceInput,
  type UpdateWorkExperienceInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { ListMyWorkExperiencesUseCase } from "../../../../core/use-case/work-experiences/list-my-work-experiences-use-case/list-my-work-experiences.use-case.js";
import { CreateWorkExperienceUseCase } from "../../../../core/use-case/work-experiences/create-work-experience-use-case/create-work-experience.use-case.js";
import { UpdateWorkExperienceUseCase } from "../../../../core/use-case/work-experiences/update-work-experience-use-case/update-work-experience.use-case.js";
import { DeleteWorkExperienceUseCase } from "../../../../core/use-case/work-experiences/delete-work-experience-use-case/delete-work-experience.use-case.js";
import { GetPublicWorkExperiencesByUsernameUseCase } from "../../../../core/use-case/work-experiences/get-public-work-experiences-by-username-use-case/get-public-work-experiences-by-username.use-case.js";
import { SetWorkExperienceDisclosureUseCase } from "../../../../core/use-case/agent-policy/set-work-experience-disclosure-use-case/set-work-experience-disclosure.use-case.js";
import { toAsyncHook } from "../../to-async-hook.js";

const workExperienceIdParamsSchema = z.object({
  id: z.uuid(),
});

/**
 * `null` is the meaningful value here, not an omission: it clears the override
 * so the role goes back to inheriting the account-level disclosure setting.
 */
const setDisclosureBodySchema = z.object({
  disclosureLevel: agentDisclosureLevelSchema.nullable(),
});

/** The base schema is shared and owned elsewhere, so the override is layered on. */
const workExperienceWithDisclosureSchema = workExperienceSchema.extend({
  disclosureLevel: agentDisclosureLevelSchema.nullable().optional(),
});

export class WorkExperienceController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/work-experiences",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Work Experience"],
          summary: "List current user work experiences",
          response: {
            200: workExperienceSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const listMyWorkExperiencesUseCase =
          resolve<ListMyWorkExperiencesUseCase>(
            TOKENS.ListMyWorkExperiencesUseCase,
          );

        const result = await listMyWorkExperiencesUseCase.execute(
          request.user!.id,
        );

        reply.status(200).send(result);
      },
    );

    app.post(
      "/me/work-experiences",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Work Experience"],
          summary: "Create a work experience",
          body: createWorkExperienceInputSchema,
          response: {
            201: workExperienceSchema,
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
        request: FastifyRequest<{ Body: CreateWorkExperienceInput }>,
        reply,
      ) => {
        const createWorkExperienceUseCase =
          resolve<CreateWorkExperienceUseCase>(
            TOKENS.CreateWorkExperienceUseCase,
          );

        const result = await createWorkExperienceUseCase.execute({
          userId: request.user!.id,
          ...request.body,
        });

        reply.status(201).send(result);
      },
    );

    app.put(
      "/me/work-experiences/:id",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Work Experience"],
          summary: "Update a work experience",
          params: workExperienceIdParamsSchema,
          body: updateWorkExperienceInputSchema,
          response: {
            200: workExperienceSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: UpdateWorkExperienceInput;
        }>,
        reply,
      ) => {
        const updateWorkExperienceUseCase =
          resolve<UpdateWorkExperienceUseCase>(
            TOKENS.UpdateWorkExperienceUseCase,
          );

        const result = await updateWorkExperienceUseCase.execute({
          userId: request.user!.id,
          workExperienceId: request.params.id,
          ...request.body,
        });

        reply.status(200).send(result);
      },
    );

    app.delete(
      "/me/work-experiences/:id",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Work Experience"],
          summary: "Delete a work experience",
          params: workExperienceIdParamsSchema,
          response: {
            200: z.object({ success: z.boolean() }),
            ...commonErrorResponses([
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const deleteWorkExperienceUseCase =
          resolve<DeleteWorkExperienceUseCase>(
            TOKENS.DeleteWorkExperienceUseCase,
          );

        await deleteWorkExperienceUseCase.execute({
          userId: request.user!.id,
          workExperienceId: request.params.id,
        });

        reply.status(200).send({ success: true });
      },
    );

    app.patch(
      "/me/work-experiences/:id/disclosure",
      {
        // `authGuard`, not `apiAccessGuard`: an agent must never be able to
        // relax the rule that constrains what it may say about this employer.
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Work Experience"],
          summary:
            "Set or clear this role's override of the agent disclosure level",
          params: workExperienceIdParamsSchema,
          body: setDisclosureBodySchema,
          response: {
            200: workExperienceWithDisclosureSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: { disclosureLevel: "summary" | "detailed" | "full" | null };
        }>,
        reply,
      ) => {
        const setWorkExperienceDisclosureUseCase =
          resolve<SetWorkExperienceDisclosureUseCase>(
            TOKENS.SetWorkExperienceDisclosureUseCase,
          );

        const result = await setWorkExperienceDisclosureUseCase.execute({
          userId: request.user!.id,
          workExperienceId: request.params.id,
          disclosureLevel: request.body.disclosureLevel,
        });

        reply.status(200).send(result);
      },
    );

    app.get(
      "/profile/:username/work-experiences",
      {
        schema: {
          tags: ["Work Experience"],
          summary: "Get public work experiences by username",
          params: usernameParamsSchema,
          response: {
            200: publicWorkExperienceSchema.array(),
            ...commonErrorResponses(["notFound", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Params: { username: string } }>,
        reply,
      ) => {
        const getPublicWorkExperiencesByUsernameUseCase =
          resolve<GetPublicWorkExperiencesByUsernameUseCase>(
            TOKENS.GetPublicWorkExperiencesByUsernameUseCase,
          );

        const result = await getPublicWorkExperiencesByUsernameUseCase.execute(
          request.params.username,
        );

        reply.status(200).send(result);
      },
    );
  }
}
