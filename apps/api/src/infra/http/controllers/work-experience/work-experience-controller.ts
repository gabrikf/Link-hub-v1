import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
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

const workExperienceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export class WorkExperienceController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/work-experiences",
      {
        preHandler: authGuard,
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
        preHandler: authGuard,
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
        preHandler: authGuard,
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
        preHandler: authGuard,
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
      async (
        request: FastifyRequest<{ Params: { id: string } }>,
        reply,
      ) => {
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
