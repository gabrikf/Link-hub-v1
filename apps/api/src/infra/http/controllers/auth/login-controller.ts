import { FastifyInstance, FastifyRequest } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { loginSchemaInput, loginSchemaOutput, LoginInput } from "@repo/schemas";
import { resolve, TOKENS } from "../../../di/container.js";
import { LoginUseCase } from "../../../../core/use-case/login-use-case/login.use-case.js";
import { commonErrorResponses } from "../../schemas/error-schemas.js";

export class LoginController {
  static async handle(server: FastifyInstance) {
    const app = server.withTypeProvider<ZodTypeProvider>();

    app.post(
      "/login",
      {
        schema: {
          body: loginSchemaInput,
          tags: ["Auth"],
          summary: "Login user",
          description:
            "Authenticates a user and returns access and refresh tokens",
          response: {
            200: loginSchemaOutput,
            ...commonErrorResponses([
              "badRequest",
              "unauthorized",
              "internalServerError",
            ]),
          },
        },
      },
      async (request: FastifyRequest<{ Body: LoginInput }>, reply) => {
        // Resolve the use case from the DI container
        const loginUseCase = resolve<LoginUseCase>(TOKENS.LoginUseCase);

        // Execute the use case - errors are automatically caught by global error handler
        const result = await loginUseCase.execute(request.body);

        // Send success response with user data, access token, and refresh token
        reply.status(200).send({
          user: result.user,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      }
    );
  }
}
