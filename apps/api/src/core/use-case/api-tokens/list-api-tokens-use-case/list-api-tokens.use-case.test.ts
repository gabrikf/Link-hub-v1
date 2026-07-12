import { beforeEach, describe, expect, it } from "vitest";
import { ApiTokenEntity } from "../../../entity/api-token/api-token-entity.js";
import { InMemoryApiTokenRepository } from "../../../repositories/api-token/in-memory-api-token-repository.js";
import { ListApiTokensUseCase } from "./list-api-tokens.use-case.js";

describe("ListApiTokensUseCase", () => {
  let apiTokenRepository: InMemoryApiTokenRepository;
  let sut: ListApiTokensUseCase;

  beforeEach(() => {
    apiTokenRepository = new InMemoryApiTokenRepository();
    sut = new ListApiTokensUseCase(apiTokenRepository);
  });

  function makeToken(userId: string, name: string) {
    return ApiTokenEntity.create({
      userId,
      name,
      tokenHash: `hash-${name}`,
      tokenPrefix: `lh_pat_${name}`,
      scopes: ["posts:read"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
    });
  }

  it("returns only the caller's own tokens", async () => {
    await apiTokenRepository.create(makeToken("user-1", "mine-a"));
    await apiTokenRepository.create(makeToken("user-1", "mine-b"));
    await apiTokenRepository.create(makeToken("user-2", "theirs"));

    const result = await sut.execute("user-1");

    expect(result).toHaveLength(2);
    expect(result.every((t) => t.userId === "user-1")).toBe(true);
    expect(result.map((t) => t.name).sort()).toEqual(["mine-a", "mine-b"]);
  });

  it("returns an empty list when the user has no tokens", async () => {
    await apiTokenRepository.create(makeToken("user-2", "theirs"));

    const result = await sut.execute("user-1");

    expect(result).toEqual([]);
  });
});
