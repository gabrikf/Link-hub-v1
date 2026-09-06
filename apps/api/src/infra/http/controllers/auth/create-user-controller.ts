import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createUserSchemaInput,
  createUserSchemaOutput,
  CreateUserInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { CreateUserUseCase } from "../../../../core/use-case/auth/create-user-use-case/create-user.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { signupsTotal } from "../../../observability/metrics.js";
import { structuredLoggingEnabled } from "../../../config/app-config.js";

export class CreateUserController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/register",
      {
        schema: {
          body: createUserSchemaInput,
          tags: ["Auth"],
          summary: "Register a new user",
          description:
            "Creates a new, UNVERIFIED user and emails a verification link. " +
            "Returns no tokens: the session is minted by /auth/verify-email " +
            "once the address is proved.",
          response: {
            201: createUserSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "conflict",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateUserInput }>, reply) => {
        // Resolve the use case from the DI container
        const createUserUseCase = resolve<CreateUserUseCase>(
          TOKENS.CreateUserUseCase,
        );
        // Execute the use case - errors are automatically caught by global error handler
        const result = await createUserUseCase.execute(request.body);

        // Counted only after the use case succeeds, so a duplicate-email 409
        // never shows up as a signup. `method` has three possible values across
        // the three auth controllers — no user identifier goes near this label.
        signupsTotal.add(1, { method: "password" });

        /**
         * A failed send does not fail the signup — the account is real and the
         * user can press "resend" — but it must not disappear either.
         *
         * Same console fallback as the global error handler: development runs
         * with Fastify's logger switched off, and `request.log` there is a
         * no-op that would swallow the one line telling you why nobody can
         * confirm their account.
         */
        if (!result.verificationEmailSent) {
          const failure = {
            userId: result.user.id,
            error: result.verificationEmailError?.message,
          };

          if (structuredLoggingEnabled()) {
            request.log.error(
              failure,
              "Verification email failed to send; account created unverified",
            );
          } else {
            console.error(
              "Verification email failed to send; account created unverified:",
              failure,
            );
          }
        }

        // No tokens: registration deliberately does not sign anyone in.
        reply.status(201).send({
          user: result.user,
          emailVerificationRequired: result.emailVerificationRequired,
        });
      },
    );
  }
}
