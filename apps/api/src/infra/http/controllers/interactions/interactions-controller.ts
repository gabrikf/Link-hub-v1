import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createInteractionInputSchema,
  interactionSchema,
  type CreateInteractionInput,
} from "@repo/schemas";
import { RecordCandidateInteractionUseCase } from "../../../../core/use-case/interactions/record-candidate-interaction-use-case/record-candidate-interaction.use-case.js";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class InteractionsController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/interactions",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Interactions"],
          summary: "Record recruiter interaction with a candidate",
          body: createInteractionInputSchema,
          response: {
            201: interactionSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        // Typed from the zod schema instead of a hand-written literal. The
        // hand-written one had already drifted: it omitted `NOT_RELEVANT` and
        // all four exposure fields, so the route validated them at the edge and
        // then dropped them before the use case ever saw them.
        request: FastifyRequest<{ Body: CreateInteractionInput }>,
        reply,
      ) => {
        const recordCandidateInteractionUseCase =
          resolve<RecordCandidateInteractionUseCase>(
            TOKENS.RecordCandidateInteractionUseCase,
          );

        const result = await recordCandidateInteractionUseCase.execute({
          resumeId: request.body.resumeId,
          recruiterId: request.user!.id,
          interactionType: request.body.interactionType,
          queryText: request.body.queryText,
          semanticSimilarity: request.body.semanticSimilarity,
          rankPosition: request.body.rankPosition,
          metadata: request.body.metadata,
          candidateSnapshot: request.body.candidateSnapshot,
          querySnapshot: request.body.querySnapshot,
          displayedRank: request.body.displayedRank,
          resultCount: request.body.resultCount,
          searchSessionId: request.body.searchSessionId,
          propensity: request.body.propensity,
        });

        // A duplicate returns the row that already carries the signal, so a
        // client firing these best-effort never sees an error for tapping the
        // same button twice.
        reply.status(201).send(result.interaction);
      },
    );
  }
}
