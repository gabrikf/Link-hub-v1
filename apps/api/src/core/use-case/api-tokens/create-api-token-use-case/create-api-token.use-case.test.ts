import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { InMemoryApiTokenRepository } from "../../../repositories/api-token/in-memory-api-token-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { CryptoTokenProvider } from "../../../../infra/providers/crypto-token-provider.js";
import { CreateApiTokenUseCase } from "./create-api-token.use-case.js";
import { expectDefined } from "../../../../test-support/expect-defined.js";

describe("CreateApiTokenUseCase", () => {
  let apiTokenRepository: InMemoryApiTokenRepository;
  let usersRepository: InMemoryUsersRepository;
  let tokenProvider: CryptoTokenProvider;
  let sut: CreateApiTokenUseCase;

  beforeEach(() => {
    apiTokenRepository = new InMemoryApiTokenRepository();
    usersRepository = new InMemoryUsersRepository();
    tokenProvider = new CryptoTokenProvider();
    sut = new CreateApiTokenUseCase(
      apiTokenRepository,
      usersRepository,
      tokenProvider,
    );
  });

  it("should create a token and return the plaintext once, storing only its hash", async () => {
    const user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(user);

    const result = await sut.execute({
      userId: user.id,
      name: "Claude Code laptop",
      scopes: ["posts:write", "posts:read"],
    });

    expect(result.token).toMatch(/^lh_pat_[0-9a-f]{40}$/);
    expect(result.tokenPrefix).toBe(result.token.slice(0, 12));
    expect(result.scopes).toEqual(["posts:write", "posts:read"]);
    expect(result.revokedAt).toBeNull();
    // The plaintext must never be persisted; only the sha256 hash is stored.
    expect(result).not.toHaveProperty("tokenHash");

    const [storedToken] = apiTokenRepository.getAll();
    const stored = expectDefined(storedToken, "the stored api token");
    expect(stored.tokenHash).toBe(tokenProvider.hash(result.token));
    expect(stored.tokenHash).not.toBe(result.token);
  });

  it("should throw when user does not exist", async () => {
    await expect(
      sut.execute({
        userId: "missing-user",
        name: "Orphan",
        scopes: ["posts:read"],
      }),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});
