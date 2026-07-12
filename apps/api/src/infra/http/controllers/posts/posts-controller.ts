import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import {
  createPostSchemaInput,
  listPostsQuerySchema,
  operationSuccessSchema,
  postParamsSchema,
  postSchema,
  updatePostSchemaInput,
  usernameParamsSchema,
  type CreatePostInput,
  type ListPostsQuery,
  type UpdatePostInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { apiAccessGuard } from "../../middleware/api-access-guard.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { CreatePostUseCase } from "../../../../core/use-case/posts/create-post-use-case/create-post.use-case.js";
import { ListMyPostsUseCase } from "../../../../core/use-case/posts/list-my-posts-use-case/list-my-posts.use-case.js";
import { ListPublicPostsUseCase } from "../../../../core/use-case/posts/list-public-posts-use-case/list-public-posts.use-case.js";
import { GetPostUseCase } from "../../../../core/use-case/posts/get-post-use-case/get-post.use-case.js";
import { UpdatePostUseCase } from "../../../../core/use-case/posts/update-post-use-case/update-post.use-case.js";
import { DeletePostUseCase } from "../../../../core/use-case/posts/delete-post-use-case/delete-post.use-case.js";

export class PostsController {
  static handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.get(
      "/me/posts",
      {
        preHandler: apiAccessGuard("posts:read"),
        schema: {
          tags: ["Posts"],
          summary: "List current user posts",
          querystring: listPostsQuerySchema,
          response: {
            200: postSchema.array(),
            ...commonErrorResponses(["unauthorized", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{ Querystring: ListPostsQuery }>,
        reply,
      ) => {
        const listMyPostsUseCase = resolve<ListMyPostsUseCase>(
          TOKENS.ListMyPostsUseCase,
        );

        const result = await listMyPostsUseCase.execute({
          userId: request.user!.id,
          limit: request.query.limit,
          offset: request.query.offset,
        });

        reply.status(200).send(result);
      },
    );

    app.get(
      "/me/posts/:id",
      {
        preHandler: apiAccessGuard("posts:read"),
        schema: {
          tags: ["Posts"],
          summary: "Get current user post by id",
          params: postParamsSchema,
          response: {
            200: postSchema,
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
        const getPostUseCase = resolve<GetPostUseCase>(TOKENS.GetPostUseCase);

        const result = await getPostUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );

    app.post(
      "/me/posts",
      {
        preHandler: apiAccessGuard("posts:write"),
        schema: {
          tags: ["Posts"],
          summary: "Create a post",
          body: createPostSchemaInput,
          response: {
            201: postSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreatePostInput }>, reply) => {
        const createPostUseCase = resolve<CreatePostUseCase>(
          TOKENS.CreatePostUseCase,
        );

        const result = await createPostUseCase.execute({
          userId: request.user!.id,
          authType: request.user!.authType,
          ...request.body,
        });

        reply.status(201).send(result);
      },
    );

    app.patch(
      "/me/posts/:id",
      {
        preHandler: apiAccessGuard("posts:write"),
        schema: {
          tags: ["Posts"],
          summary: "Update a post",
          params: postParamsSchema,
          body: updatePostSchemaInput,
          response: {
            200: postSchema,
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
          Body: UpdatePostInput;
        }>,
        reply,
      ) => {
        const updatePostUseCase = resolve<UpdatePostUseCase>(
          TOKENS.UpdatePostUseCase,
        );

        const result = await updatePostUseCase.execute({
          userId: request.user!.id,
          postId: request.params.id,
          ...request.body,
        });

        reply.status(200).send(result);
      },
    );

    app.delete(
      "/me/posts/:id",
      {
        preHandler: apiAccessGuard("posts:write"),
        schema: {
          tags: ["Posts"],
          summary: "Delete a post",
          params: postParamsSchema,
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
        const deletePostUseCase = resolve<DeletePostUseCase>(
          TOKENS.DeletePostUseCase,
        );

        const result = await deletePostUseCase.execute(
          request.user!.id,
          request.params.id,
        );

        reply.status(200).send(result);
      },
    );

    app.get(
      "/profile/:username/posts",
      {
        schema: {
          tags: ["Posts"],
          summary: "List published posts by username",
          params: usernameParamsSchema,
          querystring: listPostsQuerySchema,
          response: {
            200: postSchema.array(),
            ...commonErrorResponses(["notFound", "internalServerError"]),
          },
        },
      },
      async (
        request: FastifyRequest<{
          Params: { username: string };
          Querystring: ListPostsQuery;
        }>,
        reply,
      ) => {
        const listPublicPostsUseCase = resolve<ListPublicPostsUseCase>(
          TOKENS.ListPublicPostsUseCase,
        );

        const result = await listPublicPostsUseCase.execute({
          username: request.params.username,
          limit: request.query.limit,
          offset: request.query.offset,
        });

        reply.status(200).send(result);
      },
    );
  }
}
