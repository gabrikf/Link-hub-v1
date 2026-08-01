import { FastifyInstance } from "fastify";
import { PostsController } from "../controllers/posts/posts-controller.js";

export const postsRoutes = (server: FastifyInstance) => {
  PostsController.handle(server);
};
