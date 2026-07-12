import { beforeEach, describe, expect, it } from "vitest";
import { ApiTokenEntity } from "../../../entity/api-token/api-token-entity.js";
import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { InMemoryApiTokenRepository } from "../../../repositories/api-token/in-memory-api-token-repository.js";
import { RevokeApiTokenUseCase } from "./revoke-api-token.use-case.js";

describe("RevokeApiTokenUseCase", () => {
  let apiTokenRepository: InMemoryApiTokenRepository;
  let sut: RevokeApiTokenUseCase;

  beforeEach(() => {
    apiTokenRepository = new InMemoryApiTokenRepository();
    sut = new RevokeApiTokenUseCase(apiTokenRepository);
  });

  function makeToken(userId: string) {
    return ApiTokenEntity.create({
      userId,
      name: "token",
      tokenHash: "hash",
      tokenPrefix: "lh_pat_x",
      scopes: ["posts:write"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
  }

  it("revokes the token for its owner, stamping revokedAt and deactivating it", async () => {
    const token = makeToken("owner");
    await apiTokenRepository.create(token);
    expect(token.isActive()).toBe(true);

    const result = await sut.execute("owner", token.id);

    expect(result).toEqual({ success: true });
    const stored = await apiTokenRepository.findById(token.id);
    expect(stored?.revokedAt).toBeInstanceOf(Date);
    expect(stored?.isActive()).toBe(false);
  });

  it("throws ForbiddenError when a non-owner attempts to revoke", async () => {
    const token = makeToken("owner");
    await apiTokenRepository.create(token);

    await expect(sut.execute("intruder", token.id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const stored = await apiTokenRepository.findById(token.id);
    expect(stored?.revokedAt).toBeNull();
  });

  it("throws ResourceNotFoundError when the token does not exist", async () => {
    await expect(sut.execute("owner", "missing")).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it("is idempotent-safe: revoking an already-revoked token still succeeds", async () => {
    const token = makeToken("owner");
    token.revoke();
    const firstRevokedAt = token.revokedAt;
    await apiTokenRepository.create(token);

    const result = await sut.execute("owner", token.id);

    expect(result).toEqual({ success: true });
    const stored = await apiTokenRepository.findById(token.id);
    // Still revoked (repository.revoke re-stamps; the token stays inactive).
    expect(stored?.revokedAt).toBeInstanceOf(Date);
    expect(stored?.isActive()).toBe(false);
    expect(firstRevokedAt).toBeInstanceOf(Date);
  });
});
