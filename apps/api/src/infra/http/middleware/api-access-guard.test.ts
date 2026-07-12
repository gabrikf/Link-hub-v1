import "reflect-metadata";
import { container } from "tsyringe";
import { FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { ApiTokenEntity } from "../../../core/entity/api-token/api-token-entity.js";
import {
  ForbiddenError,
  UnauthorizedError,
} from "../../../core/errors/index.js";
import { IJwtProvider } from "../../../core/providers/jwt/jwt-provider.js";
import { InMemoryApiTokenRepository } from "../../../core/repositories/api-token/in-memory-api-token-repository.js";
import { CryptoTokenProvider } from "../../providers/crypto-token-provider.js";
import { TOKENS } from "../../di/container.js";
import { apiAccessGuard } from "./api-access-guard.js";
import { authGuard } from "./auth-guard.js";

/**
 * Fake JWT provider: treats any non-empty token as a valid session for `sub`
 * "jwt-user", and rejects the PAT-prefixed tokens (which are never JWTs).
 */
class FakeJwtProvider implements IJwtProvider {
  async sign(): Promise<string> {
    return "signed";
  }
  async verify(token: string): Promise<object | null> {
    if (token.startsWith("lh_pat_")) return null;
    return { sub: "jwt-user" };
  }
}

function makeRequest(authorization: string | undefined): FastifyRequest {
  return {
    headers: authorization ? { authorization } : {},
    user: undefined,
  } as unknown as FastifyRequest;
}

const noopReply = {} as FastifyReply;

describe("apiAccessGuard", () => {
  let apiTokenRepository: InMemoryApiTokenRepository;
  let tokenProvider: CryptoTokenProvider;

  beforeEach(() => {
    container.reset();
    apiTokenRepository = new InMemoryApiTokenRepository();
    tokenProvider = new CryptoTokenProvider();

    container.registerInstance(TOKENS.ApiTokenRepository, apiTokenRepository);
    container.registerInstance(TOKENS.TokenProvider, tokenProvider);
    container.registerInstance(TOKENS.JwtProvider, new FakeJwtProvider());
  });

  async function seedPat(scopes: string[]): Promise<string> {
    const generated = tokenProvider.generate();
    const apiToken = ApiTokenEntity.create({
      userId: "pat-user",
      name: "test",
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scopes,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
    await apiTokenRepository.create(apiToken);
    return generated.token;
  }

  it("accepts a PAT that carries the required scope", async () => {
    const token = await seedPat(["posts:read", "posts:write"]);
    const request = makeRequest(`Bearer ${token}`);

    await apiAccessGuard("posts:write")(request, noopReply);

    expect(request.user).toEqual({ id: "pat-user", authType: "pat" });
  });

  it("rejects a PAT lacking the required scope with 403", async () => {
    const token = await seedPat(["posts:read"]);
    const request = makeRequest(`Bearer ${token}`);

    await expect(
      apiAccessGuard("posts:write")(request, noopReply),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(request.user).toBeUndefined();
  });

  it("rejects an inactive (revoked) PAT with 401", async () => {
    const generated = tokenProvider.generate();
    const apiToken = ApiTokenEntity.create({
      userId: "pat-user",
      name: "test",
      tokenHash: generated.tokenHash,
      tokenPrefix: generated.tokenPrefix,
      scopes: ["posts:write"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
    apiToken.revoke();
    await apiTokenRepository.create(apiToken);
    const request = makeRequest(`Bearer ${generated.token}`);

    await expect(
      apiAccessGuard("posts:write")(request, noopReply),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("accepts a JWT session and bypasses scope enforcement", async () => {
    const request = makeRequest("Bearer some.jwt.token");

    await apiAccessGuard("posts:write")(request, noopReply);

    expect(request.user).toEqual({ id: "jwt-user", authType: "jwt" });
  });
});

describe("authGuard (JWT-only) rejects PATs", () => {
  let tokenProvider: CryptoTokenProvider;

  beforeEach(() => {
    container.reset();
    tokenProvider = new CryptoTokenProvider();
    container.registerInstance(TOKENS.JwtProvider, new FakeJwtProvider());
  });

  it("rejects a PAT presented to a plain authGuard route", async () => {
    const generated = tokenProvider.generate();
    const request = makeRequest(`Bearer ${generated.token}`);

    await expect(authGuard(request, noopReply)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    expect(request.user).toBeUndefined();
  });

  it("accepts a JWT and stamps authType jwt", async () => {
    const request = makeRequest("Bearer real.jwt");

    await authGuard(request, noopReply);

    expect(request.user).toEqual({ id: "jwt-user", authType: "jwt" });
  });
});
