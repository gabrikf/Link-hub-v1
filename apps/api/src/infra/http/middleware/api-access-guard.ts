import { FastifyReply, FastifyRequest } from "fastify";
import type { ApiTokenScope } from "@repo/schemas";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../../core/errors/index.js";
import { IJwtProvider } from "../../../core/providers/jwt/jwt-provider.js";
import {
  API_TOKEN_PREFIX,
  ITokenProvider,
} from "../../../core/providers/token/token-provider.js";
import { IApiTokenRepository } from "../../../core/repositories/api-token/api-token-repository.js";
import { resolve, TOKENS } from "../../di/container.js";

/**
 * Opt-in guard for routes that may be reached by a personal access token (PAT).
 *
 * - Real JWT sessions are always allowed (scopes are bypassed — a logged-in user
 *   already has full authority over their own resources).
 * - PATs must carry EVERY scope in `requiredScopes`, otherwise the request is
 *   rejected with 403. This makes PAT access default-deny: any route still using
 *   the plain (JWT-only) `authGuard` rejects PATs outright.
 *
 * The JWT bypass is exactly why the agent disclosure policy is NOT enforced
 * here: a guard-level check would be skipped by every real session, and a
 * session is the one caller that must keep full freedom over its own content.
 * Enforcement therefore lives in the use cases (see
 * `core/use-case/agent-policy/enforce-post-disclosure.ts`), which see
 * `request.user.authType` and can distinguish agent from human.
 */
export function apiAccessGuard(
  ...requiredScopes: ApiTokenScope[]
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async function apiAccessPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ) {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or invalid authorization header");
    }

    const token = authorizationHeader.slice("Bearer ".length).trim();

    if (!token) {
      throw new UnauthorizedError("Invalid token");
    }

    // PAT path: prefixed tokens are looked up by their deterministic sha256 hash.
    if (token.startsWith(API_TOKEN_PREFIX)) {
      const tokenProvider = resolve<ITokenProvider>(TOKENS.TokenProvider);
      const apiTokenRepository = resolve<IApiTokenRepository>(
        TOKENS.ApiTokenRepository,
      );

      const tokenHash = tokenProvider.hash(token);
      const apiToken = await apiTokenRepository.findByTokenHash(tokenHash);

      if (!apiToken || !apiToken.isActive()) {
        throw new UnauthorizedError("Invalid or expired token");
      }

      // Enforce scopes: the token must carry every required scope.
      for (const scope of requiredScopes) {
        if (!apiToken.hasScope(scope)) {
          throw new ForbiddenError(`Missing required scope: ${scope}`);
        }
      }

      request.user = { id: apiToken.userId, authType: "pat" };

      // Fire-and-forget: last-used tracking must never block or fail the request.
      void apiTokenRepository.touchLastUsed(apiToken.id).catch(() => {});
      return;
    }

    // JWT path: full session — scopes are bypassed for real sessions.
    const jwtProvider = resolve<IJwtProvider>(TOKENS.JwtProvider);
    const payload = await jwtProvider.verify(token);

    const sub =
      payload && typeof payload === "object" && "sub" in payload
        ? (payload.sub as string | undefined)
        : undefined;

    if (!sub || typeof sub !== "string") {
      throw new UnauthorizedError("Invalid token payload");
    }

    request.user = { id: sub, authType: "jwt" };
  };
}
