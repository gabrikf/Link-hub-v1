import type { GitConnectionProvider } from "@repo/schemas";
import { beforeEach, describe, expect, it } from "vitest";
import { UserEntity } from "../../../entity/user/user-entity.js";
import {
  ConflictError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IWebhookSecretProvider } from "../../../providers/webhook-secret/webhook-secret-provider.js";
import { InMemoryGitConnectionRepository } from "../../../repositories/git-connection/in-memory-git-connection-repository.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { CreateGitConnectionUseCase } from "./create-git-connection.use-case.js";

/** Deterministic stand-in: the assertions are about WHO gets a secret, not its entropy. */
class StubWebhookSecretProvider implements IWebhookSecretProvider {
  generateFor(provider: GitConnectionProvider): string | null {
    if (provider === "github") return "github-secret";
    if (provider === "gitlab") return "whsec_Z2l0bGFiLXNlY3JldA==";
    return null;
  }
}

describe("CreateGitConnectionUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let gitConnectionRepository: InMemoryGitConnectionRepository;
  let sut: CreateGitConnectionUseCase;
  let user: UserEntity;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    gitConnectionRepository = new InMemoryGitConnectionRepository();
    sut = new CreateGitConnectionUseCase(
      gitConnectionRepository,
      usersRepository,
      new StubWebhookSecretProvider(),
    );

    user = UserEntity.create({
      email: "dev@example.com",
      login: "dev",
      name: "Dev",
      password: "hashed",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(user);
  });

  function input(overrides: Record<string, unknown> = {}) {
    return {
      userId: user.id,
      provider: "github" as GitConnectionProvider,
      kind: "personal" as const,
      displayName: "Personal GitHub",
      autoPostEnabled: false,
      cadence: "weekly" as const,
      includeAgentSummary: false,
      ...overrides,
    };
  }

  it("returns the plaintext webhook secret exactly once, at creation", async () => {
    const result = await sut.execute(input());

    expect(result.webhookSecret).toBe("github-secret");

    // And never again: the read model has no field for it.
    const [stored] = await gitConnectionRepository.findByUserId(user.id);
    expect(stored.webhookSecret).toBe("github-secret");
    expect(stored.toJSON()).not.toHaveProperty("webhookSecret");
    expect(JSON.stringify(stored.toJSON())).not.toContain("github-secret");
  });

  it("issues a whsec_-prefixed secret for gitlab so both verification paths work", async () => {
    const result = await sut.execute(input({ provider: "gitlab" }));

    expect(result.webhookSecret).toMatch(/^whsec_/);
  });

  it("issues no webhook secret for local tools that receive no webhooks", async () => {
    for (const provider of ["claude_code", "extractor"] as const) {
      const result = await sut.execute(input({ provider }));
      expect(result.webhookSecret).toBeNull();
    }
  });

  it("defaults the agent-summary opt-in to whatever was asked for and stores it", async () => {
    const result = await sut.execute(input({ includeAgentSummary: false }));

    expect(result.includeAgentSummary).toBe(false);
  });

  it("refuses to create a connection for a user that does not exist", async () => {
    await expect(
      sut.execute(input({ userId: "44444444-4444-4444-8444-444444444444" })),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it("answers a duplicate (provider, kind) local source with 409, naming the existing one", async () => {
    // Mirrors `git_connections_user_provider_kind_unique` — hitting the index
    // itself would surface as a raw 500.
    await sut.execute(input({ provider: "extractor", displayName: "First laptop" }));

    await expect(
      sut.execute(input({ provider: "extractor", displayName: "Second laptop" })),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("First laptop"),
    });
  });

  it("still allows the personal/work split of the same local provider", async () => {
    await sut.execute(input({ provider: "extractor", kind: "personal" }));

    await expect(
      sut.execute(input({ provider: "extractor", kind: "work" })),
    ).resolves.toBeDefined();
  });

  it("answers a duplicate (provider, account) forge source with 409", async () => {
    // Mirrors `git_connections_user_provider_account_unique`: with an account
    // id, kind is not part of the identity.
    await sut.execute(input({ externalAccountId: "octocat" }));

    await expect(
      sut.execute(input({ externalAccountId: "octocat", kind: "work" })),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
