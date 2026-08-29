import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  resendVerificationSchemaInput,
  resendVerificationSchemaOutput,
  ResendVerificationInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { ResendVerificationUseCase } from "../../../../core/use-case/auth/resend-verification-use-case/resend-verification.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { withResponseTimeFloor } from "../../utils/response-time-floor.js";
import { authEmailResponseFloorMs } from "../../../config/app-config.js";

export class ResendVerificationController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/resend-verification",
      {
        /**
         * Per-IP ceiling on top of the per-email cooldown in the use case.
         *
         * The cooldown is the real protection — it follows the victim's address
         * rather than the sender's IP — but this stops one host burning
         * database writes by cycling through thousands of addresses. Inert when
         * @fastify/rate-limit is not registered (as in the hermetic test app),
         * which is why it is not the only guard.
         */
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "10 minutes",
          },
        },
        schema: {
          body: resendVerificationSchemaInput,
          tags: ["Auth"],
          summary: "Send another verification email",
          description:
            "Always answers 200 { status: 'sent' } — for an unknown address, " +
            "an already-verified one, and one still inside the resend cooldown " +
            "alike — and always after the same fixed delay, because a faster " +
            "answer for the unknown address would be an account-existence " +
            "oracle of its own. A malformed address is the one different " +
            "answer: it is rejected at the schema with 400, immediately, and " +
            "discloses nothing about who has an account.",
          response: {
            200: resendVerificationSchemaOutput,
            ...commonErrorResponses(["badRequest", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: ResendVerificationInput }>, reply) => {
        const resendVerificationUseCase = resolve<ResendVerificationUseCase>(
          TOKENS.ResendVerificationUseCase,
        );

        /**
         * Two things are hidden here, and they are different things.
         *
         * The OUTCOME is dropped: it tells the server whether an email went
         * out, and telling the client would undo the whole point.
         *
         * The DURATION is flattened: `withResponseTimeFloor` answers after a
         * fixed budget whatever the use case did, because the "unverified
         * account exists" branch costs a token, a row and an SMTP send while
         * the "no such account" branch costs almost nothing, and that
         * difference was a measurable ~5-25x on this machine. See the header of
         * `utils/response-time-floor.ts` for the numbers and the limits.
         *
         * A consequence worth stating: a mail transport that fails NO LONGER
         * surfaces as a 500 here. It is logged and sent to Sentry instead.
         * A 500 is reachable only from the branch that has a real unverified
         * account, so leaving it in place would have moved the oracle from the
         * clock to the status code rather than closing it.
         */
        await withResponseTimeFloor({
          request,
          floorMs: authEmailResponseFloorMs(),
          work: () => resendVerificationUseCase.execute(request.body),
        });

        reply.status(200).send({ status: "sent" });
      },
    );
  }
}
