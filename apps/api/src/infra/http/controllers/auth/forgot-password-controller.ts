import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  forgotPasswordSchemaInput,
  forgotPasswordSchemaOutput,
  ForgotPasswordInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { ForgotPasswordUseCase } from "../../../../core/use-case/auth/forgot-password-use-case/forgot-password.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { withResponseTimeFloor } from "../../utils/response-time-floor.js";
import { authEmailResponseFloorMs } from "../../../config/app-config.js";

export class ForgotPasswordController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/forgot-password",
      {
        /**
         * Per-IP ceiling on top of the per-email cooldown in the use case. The
         * cooldown is the real protection — it follows the victim's address
         * rather than the sender's IP — but this stops one host cycling through
         * thousands of addresses. Inert when @fastify/rate-limit is not
         * registered, which is why it is not the only guard.
         */
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "10 minutes",
          },
        },
        schema: {
          body: forgotPasswordSchemaInput,
          tags: ["Auth"],
          summary: "Email a password reset link",
          description:
            "Always answers 200 { status: 'sent' } — for an unknown address, a " +
            "registered one and an OAuth-only account alike — and always after " +
            "the same fixed delay, because a faster answer for the unknown " +
            "address would be an account-existence oracle of its own. A " +
            "malformed address is the one different answer: it is rejected at " +
            "the schema with 400, immediately, and discloses nothing about who " +
            "has an account.",
          response: {
            200: forgotPasswordSchemaOutput,
            ...commonErrorResponses(["badRequest", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: ForgotPasswordInput }>, reply) => {
        const forgotPasswordUseCase = resolve<ForgotPasswordUseCase>(
          TOKENS.ForgotPasswordUseCase,
        );

        /**
         * Two things are hidden here, and they are different things.
         *
         * The OUTCOME is dropped: it tells the server whether an email went
         * out, and telling the client would undo the whole point.
         *
         * The DURATION is flattened: `withResponseTimeFloor` answers after a
         * fixed budget whatever the use case did, because the "account exists"
         * branch costs a token, a row and an SMTP send while the "no such
         * account" branch costs almost nothing, and that difference was a
         * measurable ~5-25x on this machine. See the header of
         * `utils/response-time-floor.ts` for the numbers and the limits.
         *
         * A consequence worth stating: a mail transport that fails NO LONGER
         * surfaces as a 500 here. It is logged and sent to Sentry instead.
         * A 500 is reachable only from the branch that has a real account, so
         * leaving it in place would have moved the oracle from the clock to the
         * status code rather than closing it.
         */
        await withResponseTimeFloor({
          request,
          floorMs: authEmailResponseFloorMs(),
          work: () => forgotPasswordUseCase.execute(request.body),
        });

        reply.status(200).send({ status: "sent" });
      },
    );
  }
}
