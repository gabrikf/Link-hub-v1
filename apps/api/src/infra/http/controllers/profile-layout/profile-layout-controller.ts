import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createBlockSchemaInput,
  CreateBlockInput,
  createTabSchemaInput,
  CreateTabInput,
  blockIdParamsSchema,
  fullLayoutSchema,
  layoutSchema,
  layoutViewportQuerySchema,
  operationSuccessSchema,
  profileBlockSchema,
  profileTabSchema,
  renameTabSchemaInput,
  reorderTabsSchemaInput,
  ReorderTabsInput,
  tabIdParamsSchema,
  updateBlockPositionsSchemaInput,
  UpdateBlockPositionsInput,
  updateBlockSchemaInput,
  UpdateBlockInput,
  ProfileViewport,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { GetLayoutUseCase } from "../../../../core/use-case/profile-layout/get-layout-use-case/get-layout.use-case.js";
import { CreateTabUseCase } from "../../../../core/use-case/profile-layout/create-tab-use-case/create-tab.use-case.js";
import { RenameTabUseCase } from "../../../../core/use-case/profile-layout/rename-tab-use-case/rename-tab.use-case.js";
import { DeleteTabUseCase } from "../../../../core/use-case/profile-layout/delete-tab-use-case/delete-tab.use-case.js";
import { ReorderTabsUseCase } from "../../../../core/use-case/profile-layout/reorder-tabs-use-case/reorder-tabs.use-case.js";
import { CreateBlockUseCase } from "../../../../core/use-case/profile-layout/create-block-use-case/create-block.use-case.js";
import { UpdateBlockUseCase } from "../../../../core/use-case/profile-layout/update-block-use-case/update-block.use-case.js";
import { DeleteBlockUseCase } from "../../../../core/use-case/profile-layout/delete-block-use-case/delete-block.use-case.js";
import { UpdateBlockPositionsUseCase } from "../../../../core/use-case/profile-layout/update-block-positions-use-case/update-block-positions.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { authGuard } from "../../middleware/auth-guard.js";

export class ProfileLayoutController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/layout",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Get profile layout",
          querystring: layoutViewportQuerySchema,
          response: {
            200: fullLayoutSchema.or(layoutSchema),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Querystring: { viewport?: ProfileViewport } }>,
        reply,
      ) => {
        const getLayoutUseCase = resolve<GetLayoutUseCase>(
          TOKENS.GetLayoutUseCase,
        );

        const layout = await getLayoutUseCase.execute(
          request.user!.id,
          request.query.viewport,
        );

        reply.status(200).send(layout);
      },
    );

    app.post(
      "/me/layout/tabs",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Create a tab",
          body: createTabSchemaInput,
          response: {
            201: profileTabSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateTabInput }>, reply) => {
        const createTabUseCase = resolve<CreateTabUseCase>(
          TOKENS.CreateTabUseCase,
        );

        const tab = await createTabUseCase.execute(
          request.user!.id,
          request.body,
        );

        reply.status(201).send(tab);
      },
    );

    app.patch(
      "/me/layout/tabs/reorder",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Reorder tabs",
          body: reorderTabsSchemaInput,
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
      async (request: FastifyRequest<{ Body: ReorderTabsInput }>, reply) => {
        const reorderTabsUseCase = resolve<ReorderTabsUseCase>(
          TOKENS.ReorderTabsUseCase,
        );

        const result = await reorderTabsUseCase.execute(
          request.user!.id,
          request.body,
        );

        reply.status(200).send(result);
      },
    );

    app.patch(
      "/me/layout/tabs/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Rename a tab",
          params: tabIdParamsSchema,
          body: renameTabSchemaInput,
          response: {
            200: profileTabSchema,
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
          Body: { title: string };
        }>,
        reply,
      ) => {
        const renameTabUseCase = resolve<RenameTabUseCase>(
          TOKENS.RenameTabUseCase,
        );

        const tab = await renameTabUseCase.execute(
          request.user!.id,
          request.params.id,
          request.body.title,
        );

        reply.status(200).send(tab);
      },
    );

    app.delete(
      "/me/layout/tabs/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Delete a tab",
          params: tabIdParamsSchema,
          response: {
            200: operationSuccessSchema,
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
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const deleteTabUseCase = resolve<DeleteTabUseCase>(
          TOKENS.DeleteTabUseCase,
        );

        const result = await deleteTabUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );

    app.post(
      "/me/layout/blocks",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Create a custom block",
          body: createBlockSchemaInput,
          response: {
            201: profileBlockSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "forbidden",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateBlockInput }>, reply) => {
        const createBlockUseCase = resolve<CreateBlockUseCase>(
          TOKENS.CreateBlockUseCase,
        );

        const block = await createBlockUseCase.execute(
          request.user!.id,
          request.body,
        );

        reply.status(201).send(block);
      },
    );

    app.patch(
      "/me/layout/blocks/positions",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Persist block positions",
          body: updateBlockPositionsSchemaInput,
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
        request: FastifyRequest<{ Body: UpdateBlockPositionsInput }>,
        reply,
      ) => {
        const updateBlockPositionsUseCase =
          resolve<UpdateBlockPositionsUseCase>(
            TOKENS.UpdateBlockPositionsUseCase,
          );

        const result = await updateBlockPositionsUseCase.execute(
          request.user!.id,
          request.body,
        );

        reply.status(200).send(result);
      },
    );

    app.patch(
      "/me/layout/blocks/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Update a block",
          params: blockIdParamsSchema,
          body: updateBlockSchemaInput,
          response: {
            200: profileBlockSchema,
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
          Body: UpdateBlockInput;
        }>,
        reply,
      ) => {
        const updateBlockUseCase = resolve<UpdateBlockUseCase>(
          TOKENS.UpdateBlockUseCase,
        );

        const block = await updateBlockUseCase.execute(
          request.user!.id,
          request.params.id,
          request.body,
        );

        reply.status(200).send(block);
      },
    );

    app.delete(
      "/me/layout/blocks/:id",
      {
        preHandler: authGuard,
        schema: {
          tags: ["Profile Layout"],
          summary: "Delete a custom block",
          params: blockIdParamsSchema,
          response: {
            200: operationSuccessSchema,
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
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        const deleteBlockUseCase = resolve<DeleteBlockUseCase>(
          TOKENS.DeleteBlockUseCase,
        );

        const result = await deleteBlockUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );
  }
}
