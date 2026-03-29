import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  GoogleSignInInput,
  googleSignInSchemaInput,
  googleSignInSchemaOutput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { GoogleSignInUseCase } from "../../../../core/use-case/auth/google-sign-in-use-case/google-sign-in.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class GoogleSignInController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/google",
      {
        schema: {
          body: googleSignInSchemaInput,
          tags: ["Auth"],
          summary: "Sign in with Google",
          description:
            "Authenticates a user with a Google ID token and returns access and refresh tokens",
          response: {
            200: googleSignInSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: GoogleSignInInput }>, reply) => {
        const googleSignInUseCase = resolve<GoogleSignInUseCase>(
          TOKENS.GoogleSignInUseCase,
        );

        const result = await googleSignInUseCase.execute(request.body);

        reply.status(200).send({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      },
    );
  }
}
