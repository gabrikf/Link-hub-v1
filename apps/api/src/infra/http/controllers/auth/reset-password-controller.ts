import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  resetPasswordSchemaInput,
  resetPasswordSchemaOutput,
  ResetPasswordInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { ResetPasswordUseCase } from "../../../../core/use-case/auth/reset-password-use-case/reset-password.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class ResetPasswordController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/reset-password",
      {
        schema: {
          body: resetPasswordSchemaInput,
          tags: ["Auth"],
          summary: "Set a new password from a reset link",
          description:
            "Consumes the token from the reset email, stores the new password, " +
            "revokes every existing session for that account and marks the " +
            "address verified. Returns NO session — the user signs in with the " +
            "password they just chose. An unknown, expired or already-used " +
            "token answers 400 INVALID_RESET_TOKEN.",
          response: {
            200: resetPasswordSchemaOutput,
            ...commonErrorResponses(["badRequest", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: ResetPasswordInput }>, reply) => {
        const resetPasswordUseCase = resolve<ResetPasswordUseCase>(
          TOKENS.ResetPasswordUseCase,
        );

        await resetPasswordUseCase.execute(request.body);

        reply.status(200).send({ status: "reset" });
      },
    );
  }
}
