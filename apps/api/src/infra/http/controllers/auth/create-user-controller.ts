import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod/v4";
import {
  createUserSchemaInput,
  createUserSchemaOutput,
  CreateUserInput,
} from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { CreateUserUseCase } from "../../../../core/use-case/auth/create-user-use-case/create-user.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";
import { signupsTotal } from "../../../observability/metrics.js";

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
            ...commonErrorResponses([
              "badRequest",
              "conflict",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: CreateUserInput }>, reply) => {
        // Resolve the use case from the DI container
        const createUserUseCase = resolve<CreateUserUseCase>(
          TOKENS.CreateUserUseCase,
        );
        // Execute the use case - errors are automatically caught by global error handler
        const result = await createUserUseCase.execute(request.body);

        // Counted only after the use case succeeds, so a duplicate-email 409
        // never shows up as a signup. `method` has three possible values across
        // the three auth controllers — no user identifier goes near this label.
        signupsTotal.add(1, { method: "password" });

        // Send success response with user data, access token, and refresh token
        reply.status(201).send({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      },
    );
  }
}
