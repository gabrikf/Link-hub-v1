import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
  createPostSchemaInput,
  listPostsQuerySchema,
  operationSuccessSchema,
  postParamsSchema,
  postSchema,
  updatePostSchemaInput,
  usernameParamsSchema,
  type ListPostsQuery,
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
import { ApprovePostUseCase } from "../../../../core/use-case/posts/approve-post-use-case/approve-post.use-case.js";

/**
 * Attributes a post to one of the author's roles, so the disclosure policy can
 * apply that role's override instead of the account default.
 *
 * Layered on here rather than in @repo/schemas because the shared post schemas
 * are owned elsewhere; `.extend()` keeps every existing field, message and
 * bound intact while adding one optional key.
 */
const workExperienceIdField = {
  workExperienceId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Id of the work experience this post came out of. Inherits that role's disclosure level.",
    ),
};

const createPostBodySchema = createPostSchemaInput.extend(
  workExperienceIdField,
);
const updatePostBodySchema = updatePostSchemaInput.extend(
  workExperienceIdField,
);
const postResponseSchema = postSchema.extend({
  workExperienceId: z.string().nullable().optional(),
});

/**
 * The same post, minus `metadata`, for the UNAUTHENTICATED profile feed.
 *
 * `metadata` is provenance the OWNER needs — the review queue renders repo,
 * commit count and period from it — and it is the one field on a post that can
 * still hold a repository name, because a coding agent supplies it rather than
 * the deterministic template. Serving it on a public route would publish the
 * exact identifier every other layer of this feature works to keep out, so the
 * public projection drops the whole bag rather than trusting each writer to
 * have filled it in safely.
 */
const publicPostResponseSchema = postResponseSchema.omit({ metadata: true });

type CreatePostBody = z.infer<typeof createPostBodySchema>;
type UpdatePostBody = z.infer<typeof updatePostBodySchema>;

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
            200: postResponseSchema.array(),
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
            200: postResponseSchema,
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
          body: createPostBodySchema,
          response: {
            201: postResponseSchema,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "notFound",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreatePostBody }>, reply) => {
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
          body: updatePostBodySchema,
          response: {
            200: postResponseSchema,
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
          Body: UpdatePostBody;
        }>,
        reply,
      ) => {
        const updatePostUseCase = resolve<UpdatePostUseCase>(
          TOKENS.UpdatePostUseCase,
        );

        const result = await updatePostUseCase.execute({
          userId: request.user!.id,
          postId: request.params.id,
          // The use case enforces the disclosure policy for agents only, so it
          // has to know which kind of caller this is.
          authType: request.user!.authType,
          ...request.body,
        });

        reply.status(200).send(result);
      },
    );

    app.post(
      "/me/posts/:id/approve",
      {
        preHandler: apiAccessGuard("posts:write"),
        schema: {
          tags: ["Posts"],
          summary: "Approve a post awaiting review",
          description:
            "Publishes a post that is waiting for review. This is the only way " +
            "a machine-authored post becomes public — its content stays " +
            "immutable, so approving is consent to the text as written.",
          params: postParamsSchema,
          response: {
            200: postResponseSchema,
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
        const approvePostUseCase = resolve<ApprovePostUseCase>(
          TOKENS.ApprovePostUseCase,
        );

        const result = await approvePostUseCase.execute({
          userId: request.user!.id,
          postId: request.params.id,
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
            200: publicPostResponseSchema.array(),
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
