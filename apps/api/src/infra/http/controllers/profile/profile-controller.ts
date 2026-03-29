import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  profileSchema,
  updateProfileSchemaInput,
  updateProfileSchemaOutput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { GetPublicProfileUseCase } from "../../../../core/use-case/profiles/get-public-profile-use-case/get-public-profile.use-case.js";
import { GetMeProfileUseCase } from "../../../../core/use-case/profiles/get-me-profile-use-case/get-me-profile.use-case.js";
import { UpdateProfileUseCase } from "../../../../core/use-case/profiles/update-profile-use-case/update-profile.use-case.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class ProfileController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/profile/:username",
      {
        schema: {
          tags: ["Profile"],
          summary: "Get public profile",
          response: {
            200: profileSchema,
            ...commonErrorResponses(["notFound", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Params: { username: string } }>,
        reply,
      ) => {
        const getPublicProfileUseCase = resolve<GetPublicProfileUseCase>(
          TOKENS.GetPublicProfileUseCase,
        );

        const result = await getPublicProfileUseCase.execute(
          request.params.username,
        );

        reply.status(200).send(result);
      },
    );

    app.get(
      "/me",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile"],
          summary: "Get current user profile",
          response: {
            200: profileSchema,
            ...commonErrorResponses([
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const getMeProfileUseCase = resolve<GetMeProfileUseCase>(
          TOKENS.GetMeProfileUseCase,
        );

        const result = await getMeProfileUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.put(
      "/profile",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile"],
          summary: "Update current user profile",
          body: updateProfileSchemaInput,
          response: {
            200: updateProfileSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "conflict",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Body: {
            username: string;
            name?: string;
            description?: string | null;
          };
        }>,
        reply,
      ) => {
        const updateProfileUseCase = resolve<UpdateProfileUseCase>(
          TOKENS.UpdateProfileUseCase,
        );

        const result = await updateProfileUseCase.execute({
          userId: request.user!.id,
          username: request.body.username,
          name: request.body.name,
          description: request.body.description,
        });

        reply.status(200).send(result);
      },
    );
  }
}
