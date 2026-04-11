import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createLinkSchemaInput,
  linkParamsSchema,
  linkSchema,
  operationSuccessSchema,
  reorderLinksSchemaInput,
  toggleLinkVisibilitySchemaInput,
  updateLinkSchemaInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { ListUserLinksUseCase } from "../../../../core/use-case/links/list-user-links-use-case/list-user-links.use-case.js";
import { GetLinkByIdUseCase } from "../../../../core/use-case/links/get-link-by-id-use-case/get-link-by-id.use-case.js";
import { CreateLinkUseCase } from "../../../../core/use-case/links/create-link-use-case/create-link.use-case.js";
import { UpdateLinkUseCase } from "../../../../core/use-case/links/update-link-use-case/update-link.use-case.js";
import { DeleteLinkUseCase } from "../../../../core/use-case/links/delete-link-use-case/delete-link.use-case.js";
import { ReorderLinksUseCase } from "../../../../core/use-case/links/reorder-links-use-case/reorder-links.use-case.js";
import { ToggleLinkVisibilityUseCase } from "../../../../core/use-case/links/toggle-link-visibility-use-case/toggle-link-visibility.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { authGuard } from "../../middleware/auth-guard.js";

export class LinksController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/links",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "List links",
          response: {
            200: linkSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (request: FastifyRequest, reply) => {
        const listUserLinksUseCase = resolve<ListUserLinksUseCase>(
          TOKENS.ListUserLinksUseCase,
        );
        const links = await listUserLinksUseCase.execute(request.user!.id);

        reply.status(200).send(links);
      },
    );

    app.get(
      "/links/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "Get link by id",
          params: linkParamsSchema,
          response: {
            200: linkSchema,
            ...commonErrorResponses([
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const getLinkByIdUseCase = resolve<GetLinkByIdUseCase>(
          TOKENS.GetLinkByIdUseCase,
        );

        const link = await getLinkByIdUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(link);
      },
    );

    app.post(
      "/links",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "Create link",
          body: createLinkSchemaInput,
          response: {
            201: linkSchema,
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
          Body: {
            title: string;
            url: string;
            icon?: string | null;
            isPublic: boolean;
          };
        }>,
        reply,
      ) => {
        const createLinkUseCase = resolve<CreateLinkUseCase>(
          TOKENS.CreateLinkUseCase,
        );

        const link = await createLinkUseCase.execute({
          userId: request.user!.id,
          title: request.body.title,
          url: request.body.url,
          icon: request.body.icon,
          isPublic: request.body.isPublic,
        });

        reply.status(201).send(link);
      },
    );

    app.put(
      "/links/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "Update link",
          params: linkParamsSchema,
          body: updateLinkSchemaInput,
          response: {
            200: linkSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: {
            title: string;
            url: string;
            icon?: string | null;
            isPublic: boolean;
          };
        }>,
        reply,
      ) => {
        const updateLinkUseCase = resolve<UpdateLinkUseCase>(
          TOKENS.UpdateLinkUseCase,
        );

        const link = await updateLinkUseCase.execute({
          userId: request.user!.id,
          linkId: request.params.id,
          title: request.body.title,
          url: request.body.url,
          icon: request.body.icon,
          isPublic: request.body.isPublic,
        });

        reply.status(200).send(link);
      },
    );

    app.delete(
      "/links/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "Delete link",
          params: linkParamsSchema,
          response: {
            200: operationSuccessSchema,
            ...commonErrorResponses([
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const deleteLinkUseCase = resolve<DeleteLinkUseCase>(
          TOKENS.DeleteLinkUseCase,
        );

        const result = await deleteLinkUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );

    app.patch(
      "/links/reorder",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "Reorder links",
          body: reorderLinksSchemaInput,
          response: {
            200: operationSuccessSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Body: { linkIds: string[] } }>,
        reply,
      ) => {
        const reorderLinksUseCase = resolve<ReorderLinksUseCase>(
          TOKENS.ReorderLinksUseCase,
        );

        const result = await reorderLinksUseCase.execute(
          request.user!.id,
          request.body.linkIds,
        );

        reply.status(200).send(result);
      },
    );

    app.patch(
      "/links/:id/visibility",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Links"],
          summary: "Toggle link visibility",
          params: linkParamsSchema,
          body: toggleLinkVisibilitySchemaInput,
          response: {
            200: linkSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: { isPublic: boolean };
        }>,
        reply,
      ) => {
        const toggleLinkVisibilityUseCase =
          resolve<ToggleLinkVisibilityUseCase>(
            TOKENS.ToggleLinkVisibilityUseCase,
          );

        const link = await toggleLinkVisibilityUseCase.execute(
          request.user!.id,
          request.params.id,
          request.body.isPublic,
        );

        reply.status(200).send(link);
      },
    );
  }
}
