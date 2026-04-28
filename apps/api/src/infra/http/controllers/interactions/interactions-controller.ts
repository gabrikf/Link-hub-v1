import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { createInteractionInputSchema, interactionSchema } from "@repo/schemas";
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
        request: FastifyRequest<{
          Body: {
            resumeId: string;
            interactionType: "EMAIL_COPY" | "CONTACT_CLICK" | "PROFILE_VIEW";
            queryText?: string | null;
            semanticSimilarity?: number | null;
            rankPosition?: number | null;
            metadata?: Record<string, unknown>;
            candidateSnapshot?: Record<string, unknown>;
            querySnapshot?: Record<string, unknown>;
          };
        }>,
        reply,
      ) => {
        const recordCandidateInteractionUseCase =
          resolve<RecordCandidateInteractionUseCase>(
            TOKENS.RecordCandidateInteractionUseCase,
          );

        const interaction = await recordCandidateInteractionUseCase.execute({
          resumeId: request.body.resumeId,
          recruiterId: request.user!.id,
          interactionType: request.body.interactionType,
          queryText: request.body.queryText,
          semanticSimilarity: request.body.semanticSimilarity,
          rankPosition: request.body.rankPosition,
          metadata: request.body.metadata,
          candidateSnapshot: request.body.candidateSnapshot,
          querySnapshot: request.body.querySnapshot,
        });

        reply.status(201).send(interaction);
      },
    );
  }
}
