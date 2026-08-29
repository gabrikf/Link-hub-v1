import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  verifyEmailSchemaInput,
  verifyEmailSchemaOutput,
  VerifyEmailInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { VerifyEmailUseCase } from "../../../../core/use-case/auth/verify-email-use-case/verify-email.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class VerifyEmailController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/verify-email",
      {
        schema: {
          body: verifyEmailSchemaInput,
          tags: ["Auth"],
          summary: "Confirm an email address",
          description:
            "Consumes the token from the verification email, marks the address " +
            "as verified and returns a signed-in session. An unknown, expired " +
            "or already-used token answers 400 INVALID_VERIFICATION_TOKEN — the " +
            "four failure modes are deliberately indistinguishable.",
          response: {
            200: verifyEmailSchemaOutput,
            ...commonErrorResponses(["badRequest", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: VerifyEmailInput }>, reply) => {
        const verifyEmailUseCase = resolve<VerifyEmailUseCase>(
          TOKENS.VerifyEmailUseCase,
        );

        const result = await verifyEmailUseCase.execute(request.body);

        reply.status(200).send({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      },
    );
  }
}
