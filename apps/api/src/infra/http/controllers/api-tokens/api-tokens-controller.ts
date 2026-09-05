import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  apiTokenParamsSchema,
  apiTokenSchema,
  createApiTokenSchemaInput,
  createApiTokenSchemaOutput,
  operationSuccessSchema,
  type CreateApiTokenInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { CreateApiTokenUseCase } from "../../../../core/use-case/api-tokens/create-api-token-use-case/create-api-token.use-case.js";
import { ListApiTokensUseCase } from "../../../../core/use-case/api-tokens/list-api-tokens-use-case/list-api-tokens.use-case.js";
import { RevokeApiTokenUseCase } from "../../../../core/use-case/api-tokens/revoke-api-token-use-case/revoke-api-token.use-case.js";
import { toAsyncHook } from "../../to-async-hook.js";

/**
 * Fastify's typed `preHandler` property resolves to the callback-style hook
 * signature (`(request, reply, done) => void`), never the promise-returning
 * one — `preHandlerMetaHookHandler`'s `Return` generic always defaults to
 * `void` at that property, regardless of how the guard function passed in is
 * itself typed. Adapting an async guard to the callback form here keeps the
 * guard itself a plain `async` function with no behaviour change: a
 * rejection becomes `done(error)`, which Fastify routes to the same error
 * handler an async hook's rejection would.
 */

export class ApiTokensController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/tokens",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["API Tokens"],
          summary: "List current user personal access tokens",
          response: {
            200: apiTokenSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const listApiTokensUseCase = resolve<ListApiTokensUseCase>(
          TOKENS.ListApiTokensUseCase,
        );

        const result = await listApiTokensUseCase.execute(request.user!.id);

        reply.status(200).send(result);
      },
    );

    app.post(
      "/me/tokens",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["API Tokens"],
          summary: "Create a personal access token",
          body: createApiTokenSchemaInput,
          response: {
            201: createApiTokenSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateApiTokenInput }>, reply) => {
        const createApiTokenUseCase = resolve<CreateApiTokenUseCase>(
          TOKENS.CreateApiTokenUseCase,
        );

        const result = await createApiTokenUseCase.execute({
          userId: request.user!.id,
          name: request.body.name,
          scopes: request.body.scopes,
          expiresAt: request.body.expiresAt,
        });

        reply.status(201).send(result);
      },
    );

    app.delete(
      "/me/tokens/:id",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["API Tokens"],
          summary: "Revoke a personal access token",
          params: apiTokenParamsSchema,
          response: {
            200: operationSuccessSchema,
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
        const revokeApiTokenUseCase = resolve<RevokeApiTokenUseCase>(
          TOKENS.RevokeApiTokenUseCase,
        );

        const result = await revokeApiTokenUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );
  }
}
