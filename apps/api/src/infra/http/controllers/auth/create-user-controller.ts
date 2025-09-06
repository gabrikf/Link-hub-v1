import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { users } from "../../../database/schema.js";
import {
  createUserSchemaInput,
  createUserSchemaOutput,
  CreateUserInput,
} from "@repo/schemas";

export class CreateUserController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/register",
      {
        schema: {
          body: createUserSchemaInput,
          tags: ["Auth"],
          summary: "Register a new user",
          description: "Creates a new user in the system",
          response: {
            201: createUserSchemaOutput,
            500: z.object({
              error: z.string(),
            }),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateUserInput }>, reply) => {
        const { email, login, name, password, description, avatarUrl } =
          request.body;

        try {
          // Create user in the database using Drizzle
          const [user] = await server.db
            .insert(users)
            .values({
              email,
              login,
              name,
              password, // Remember to hash this password before storing!
              description,
              avatarUrl,
            })
            .returning();

          // Generate JWT token (you'll need to implement this)
          const token = "dummy-jwt-token"; // Replace with actual JWT generation

          // Send response (exclude password from response and map field names)
          const { password: _, ...userResponse } = user;
          reply.status(201).send({
            user: {
              id: userResponse.id,
              email: userResponse.email,
              login: userResponse.login,
              name: userResponse.name,
              description: userResponse.description,
              avatarUrl: userResponse.avatarUrl,
              // Map snake_case DB fields to camelCase API fields
              createdAt:
                userResponse.created_at?.toISOString() ||
                new Date().toISOString(),
              updatedAt:
                userResponse.updated_at?.toISOString() ||
                new Date().toISOString(),
            },
            token,
          });
        } catch (error) {
          reply.status(500).send({ error: "Failed to create user" });
        }
      }
    );
  }
}
