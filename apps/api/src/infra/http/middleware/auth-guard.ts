import { FastifyReply, FastifyRequest } from "fastify";
import { UnauthorizedError } from "../../../core/errors/index.js";
import { IJwtProvider } from "../../../core/providers/jwt/jwt-provider.js";
import { resolve, TOKENS } from "../../di/container.js";

export async function authGuard(request: FastifyRequest, _reply: FastifyReply) {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid authorization header");
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();

  if (!token) {
    throw new UnauthorizedError("Invalid token");
  }

  const jwtProvider = resolve<IJwtProvider>(TOKENS.JwtProvider);
  const payload = await jwtProvider.verify(token);

  const sub =
    payload && typeof payload === "object" && "sub" in payload
      ? (payload.sub as string | undefined)
      : undefined;

  if (!sub || typeof sub !== "string") {
    throw new UnauthorizedError("Invalid token payload");
  }

  request.user = { id: sub };
}
