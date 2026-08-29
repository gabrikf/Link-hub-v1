import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  refreshSessionSchemaInput,
  refreshSessionSchemaOutput,
  RefreshSessionInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { RefreshSessionUseCase } from "../../../../core/use-case/auth/refresh-session-use-case/refresh-session.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

/**
 * `POST /auth/refresh`.
 *
 * The web client has shipped a complete refresher against this route for a
 * while (`apps/web/src/lib/unauthorized-interceptor.ts`): it POSTs
 * `{ refreshToken }` as JSON and parses `{ accessToken, refreshToken }` back.
 * Until this existed it got a 404, latched "unsupported" and signed the user
 * out on the first expiry — every 15 minutes, by the access token's TTL.
 */
export class RefreshSessionController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/refresh",
      {
        schema: {
          body: refreshSessionSchemaInput,
          tags: ["Auth"],
          summary: "Exchange a refresh token for a new session",
          description:
            "Rotates the refresh token: the presented one is deleted and a new " +
            "pair is returned, so each refresh token is usable exactly once. " +
            "An unknown or expired token answers 401.",
          response: {
            200: refreshSessionSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: RefreshSessionInput }>, reply) => {
        const refreshSessionUseCase = resolve<RefreshSessionUseCase>(
          TOKENS.RefreshSessionUseCase,
        );

        const result = await refreshSessionUseCase.execute(request.body);

        reply.status(200).send({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      },
    );
  }
}
