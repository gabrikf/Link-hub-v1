import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
  createGitConnectionSchemaInput,
  digestPreviewSchema,
  gitConnectionHealthSchema,
  gitConnectionParamsSchema,
  gitConnectionSchema,
  ingestActivityResultSchema,
  ingestActivitySchemaInput,
  operationSuccessSchema,
  updateGitConnectionSchemaInput,
  type CreateGitConnectionInput,
  type IngestActivityInput,
  type UpdateGitConnectionInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { authGuard } from "../../middleware/auth-guard.js";
import { apiAccessGuard } from "../../middleware/api-access-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { CreateGitConnectionUseCase } from "../../../../core/use-case/activity/create-git-connection-use-case/create-git-connection.use-case.js";
import { ListGitConnectionsUseCase } from "../../../../core/use-case/activity/list-git-connections-use-case/list-git-connections.use-case.js";
import { UpdateGitConnectionUseCase } from "../../../../core/use-case/activity/update-git-connection-use-case/update-git-connection.use-case.js";
import { DeleteGitConnectionUseCase } from "../../../../core/use-case/activity/delete-git-connection-use-case/delete-git-connection.use-case.js";
import { IngestActivityUseCase } from "../../../../core/use-case/activity/ingest-activity-use-case/ingest-activity.use-case.js";
import { GetConnectionHealthUseCase } from "../../../../core/use-case/activity/get-connection-health-use-case/get-connection-health.use-case.js";
import { PreviewActivityDigestUseCase } from "../../../../core/use-case/activity/preview-activity-digest-use-case/preview-activity-digest.use-case.js";
import { toAsyncHook } from "../../to-async-hook.js";

/**
 * The create response, and ONLY the create response.
 *
 * `gitConnectionSchema` omits `webhookSecret` deliberately — no read path has a
 * reason to see a verification credential again — so the one moment it must be
 * disclosed is expressed as an extension here rather than by widening the read
 * model, exactly like `createApiTokenSchemaOutput` does for the plaintext PAT.
 * Declared locally because it describes one endpoint's response, not a domain
 * model the web app or the MCP server shares.
 */
const createGitConnectionSchemaOutput = gitConnectionSchema.extend({
  /** The one-time plaintext secret. Null for providers with no signed webhooks. */
  webhookSecret: z.string().nullable(),
});

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

export class ActivityController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/connections",
      {
        // `authGuard`, NOT `apiAccessGuard`. See the POST below.
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Activity"],
          summary: "List the current user's activity connections",
          response: {
            200: gitConnectionSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const listGitConnectionsUseCase = resolve<ListGitConnectionsUseCase>(
          TOKENS.ListGitConnectionsUseCase,
        );

        const result = await listGitConnectionsUseCase.execute(
          request.user!.id,
        );

        reply.status(200).send(result.map((connection) => connection.toJSON()));
      },
    );

    app.post(
      "/me/connections",
      {
        /**
         * JWT ONLY — the whole connections surface is, and this is the reason:
         * a connection is what defines the disclosure scope a PAT ingests
         * under. If a PAT could create a connection or repoint an existing one
         * at a different work experience, a token minted for `activity:write`
         * could quietly re-classify an employer's work as personal and publish
         * it. Only the human, in a real session, decides what is connected.
         */
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Activity"],
          summary: "Connect an activity source (human sessions only)",
          body: createGitConnectionSchemaInput,
          response: {
            201: createGitConnectionSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              // A duplicate of the (user, provider, account/kind) identity —
              // the use case answers it before the unique index has to.
              "conflict",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Body: CreateGitConnectionInput }>,
        reply,
      ) => {
        const createGitConnectionUseCase = resolve<CreateGitConnectionUseCase>(
          TOKENS.CreateGitConnectionUseCase,
        );

        const result = await createGitConnectionUseCase.execute({
          userId: request.user!.id,
          provider: request.body.provider,
          kind: request.body.kind,
          displayName: request.body.displayName,
          externalAccountId: request.body.externalAccountId,
          workExperienceId: request.body.workExperienceId,
          disclosureLevelOverride: request.body.disclosureLevelOverride,
          autoPostEnabled: request.body.autoPostEnabled,
          cadence: request.body.cadence,
          includeAgentSummary: request.body.includeAgentSummary,
        });

        reply.status(201).send(result);
      },
    );

    app.patch(
      "/me/connections/:id",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Activity"],
          summary: "Update an activity connection (human sessions only)",
          params: gitConnectionParamsSchema,
          body: updateGitConnectionSchemaInput,
          response: {
            200: gitConnectionSchema,
            // No `forbidden`: someone else's connection answers 404, exactly
            // like health/preview, so ids cannot be probed for existence.
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: UpdateGitConnectionInput;
        }>,
        reply,
      ) => {
        const updateGitConnectionUseCase = resolve<UpdateGitConnectionUseCase>(
          TOKENS.UpdateGitConnectionUseCase,
        );

        const result = await updateGitConnectionUseCase.execute({
          userId: request.user!.id,
          connectionId: request.params.id,
          displayName: request.body.displayName,
          kind: request.body.kind,
          workExperienceId: request.body.workExperienceId,
          disclosureLevelOverride: request.body.disclosureLevelOverride,
          autoPostEnabled: request.body.autoPostEnabled,
          cadence: request.body.cadence,
          includeAgentSummary: request.body.includeAgentSummary,
        });

        reply.status(200).send(result.toJSON());
      },
    );

    app.delete(
      "/me/connections/:id",
      {
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Activity"],
          summary: "Disconnect an activity source (human sessions only)",
          params: gitConnectionParamsSchema,
          response: {
            200: operationSuccessSchema,
            // No `forbidden` — see the PATCH above.
            ...commonErrorResponses([
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const deleteGitConnectionUseCase = resolve<DeleteGitConnectionUseCase>(
          TOKENS.DeleteGitConnectionUseCase,
        );

        const result = await deleteGitConnectionUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );

    app.get(
      "/me/connections/:id/health",
      {
        // JWT ONLY, like the rest of the connections surface: health reveals
        // whether a connection id is live, which is exactly the reconnaissance
        // a leaked `activity:write` token should not be able to do.
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Activity"],
          summary: "Ingestion health of one connection (human sessions only)",
          params: gitConnectionParamsSchema,
          response: {
            200: gitConnectionHealthSchema,
            ...commonErrorResponses([
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const getConnectionHealthUseCase = resolve<GetConnectionHealthUseCase>(
          TOKENS.GetConnectionHealthUseCase,
        );

        const result = await getConnectionHealthUseCase.execute({
          userId: request.user!.id,
          connectionId: request.params.id,
        });

        reply.status(200).send(result);
      },
    );

    app.get(
      "/me/connections/:id/digest-preview",
      {
        // JWT ONLY for the same reason as /health, plus one of its own: the
        // preview renders redacted work activity as prose, and that text is
        // for the owner's eyes in a real session, not for a token.
        preHandler: toAsyncHook(authGuard),
        schema: {
          tags: ["Activity"],
          summary:
            "Preview what the next digest would say, persisting nothing " +
            "(human sessions only)",
          params: gitConnectionParamsSchema,
          response: {
            200: digestPreviewSchema,
            ...commonErrorResponses([
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const previewActivityDigestUseCase =
          resolve<PreviewActivityDigestUseCase>(
            TOKENS.PreviewActivityDigestUseCase,
          );

        const result = await previewActivityDigestUseCase.execute({
          userId: request.user!.id,
          connectionId: request.params.id,
        });

        reply.status(200).send(result);
      },
    );

    app.post(
      "/me/activity",
      {
        /**
         * The one activity route a token may reach, and only with the scope
         * that is deliberately absent from the default grant. Appending is a
         * capability the user opts into by connecting a source; a token that
         * can append can also write plausible fabricated history.
         */
        preHandler: toAsyncHook(apiAccessGuard("activity:write")),
        schema: {
          tags: ["Activity"],
          summary: "Append a batch of developer activity",
          body: ingestActivitySchemaInput,
          response: {
            // 200, not 201: a batch that was entirely duplicates created
            // nothing, and the caller reads `recorded`/`duplicates` to find out
            // which — it must never have to interpret a status code for that.
            200: ingestActivityResultSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: IngestActivityInput }>, reply) => {
        const ingestActivityUseCase = resolve<IngestActivityUseCase>(
          TOKENS.IngestActivityUseCase,
        );

        const result = await ingestActivityUseCase.execute({
          userId: request.user!.id,
          connectionId: request.body.connectionId,
          source: request.body.source,
          events: request.body.events,
        });

        reply.status(200).send(result);
      },
    );
  }
}
