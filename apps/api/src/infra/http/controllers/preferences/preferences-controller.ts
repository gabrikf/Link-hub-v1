import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  updateUserPreferencesSchemaInput,
  updateUserPreferencesSchemaOutput,
  userPreferencesSchema,
  type UpdateUserPreferencesInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { GetUserPreferencesUseCase } from "../../../../core/use-case/preferences/get-user-preferences-use-case/get-user-preferences.use-case.js";
import { UpdateUserPreferencesUseCase } from "../../../../core/use-case/preferences/update-user-preferences-use-case/update-user-preferences.use-case.js";
import { toAsyncHook } from "../../to-async-hook.js";

/**
 * The caller's own UI preferences.
 *
 * `authGuard`, not `apiAccessGuard`: these are private settings for a human's
 * browser session and there is no reason for a long-lived agent token to read
 * — let alone change — which language a person renders their dashboard in.
 *
 * Note what is NOT here: no `/preferences/:username`, no preferences field on
 * any profile route. The whole point of the separate table (see the comment on
 * `userPreferences` in `schema.ts`) is that there is exactly one way to read
 * these values and it requires being the person they belong to.
 */
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

export class PreferencesController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/preferences",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Preferences"],
          summary: "Get the current user's language and theme preferences",
          response: {
            200: userPreferencesSchema,
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const getUserPreferencesUseCase = resolve<GetUserPreferencesUseCase>(
          TOKENS.GetUserPreferencesUseCase,
        );

        const result = await getUserPreferencesUseCase.execute(
          request.user!.id,
        );

        reply.status(200).send(result);
      },
    );

    app.put(
      "/preferences",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Preferences"],
          summary: "Update language and/or theme, returning the full new state",
          body: updateUserPreferencesSchemaInput,
          response: {
            200: updateUserPreferencesSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Body: UpdateUserPreferencesInput }>,
        reply,
      ) => {
        const updateUserPreferencesUseCase =
          resolve<UpdateUserPreferencesUseCase>(
            TOKENS.UpdateUserPreferencesUseCase,
          );

        const result = await updateUserPreferencesUseCase.execute({
          userId: request.user!.id,
          language: request.body.language,
          theme: request.body.theme,
        });

        reply.status(200).send(result);
      },
    );
  }
}
