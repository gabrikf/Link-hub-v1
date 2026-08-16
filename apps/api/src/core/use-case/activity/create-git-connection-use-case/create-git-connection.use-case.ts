import type {
  AgentDisclosureLevel,
  DigestCadence,
  GitConnectionKind,
  GitConnectionProvider,
} from "@repo/schemas";
import { GitConnectionEntity } from "../../../entity/git-connection/git-connection-entity.js";
import {
  ConflictError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IWebhookSecretProvider } from "../../../providers/webhook-secret/webhook-secret-provider.js";
import { IGitConnectionRepository } from "../../../repositories/git-connection/git-connection-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface ICreateGitConnectionInput {
  userId: string;
  provider: GitConnectionProvider;
  kind: GitConnectionKind;
  displayName: string;
  externalAccountId?: string | null;
  workExperienceId?: string | null;
  disclosureLevelOverride?: AgentDisclosureLevel | null;
  autoPostEnabled: boolean;
  cadence: DigestCadence;
  includeAgentSummary: boolean;
}

export class CreateGitConnectionUseCase {
  constructor(
    private gitConnectionRepository: IGitConnectionRepository,
    private usersRepository: IUsersRepository,
    private webhookSecretProvider: IWebhookSecretProvider,
  ) {}

  async execute(input: ICreateGitConnectionInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    // Mirrors the two partial unique indexes on `git_connections`, so a
    // duplicate answers 409 with a message naming the existing row instead of
    // surfacing as a raw unique-violation 500. Identity is (user, provider,
    // account) when a forge account id exists, and (user, provider, kind) for
    // local tools that have none.
    const externalAccountId = input.externalAccountId ?? null;
    const existing = (
      await this.gitConnectionRepository.findByUserId(input.userId)
    ).find((connection) =>
      externalAccountId !== null
        ? connection.provider === input.provider &&
          connection.externalAccountId === externalAccountId
        : connection.provider === input.provider &&
          connection.kind === input.kind &&
          connection.externalAccountId === null,
    );

    if (existing) {
      throw new ConflictError(
        `A ${input.provider} (${input.kind}) source already exists: ` +
          `"${existing.displayName}". Finish its setup or disconnect it first.`,
      );
    }

    const webhookSecret = this.webhookSecretProvider.generateFor(
      input.provider,
    );

    const connection = GitConnectionEntity.create({
      userId: input.userId,
      provider: input.provider,
      kind: input.kind,
      displayName: input.displayName,
      externalAccountId: input.externalAccountId ?? null,
      workExperienceId: input.workExperienceId ?? null,
      disclosureLevelOverride: input.disclosureLevelOverride ?? null,
      webhookSecret,
      autoPostEnabled: input.autoPostEnabled,
      cadence: input.cadence,
      includeAgentSummary: input.includeAgentSummary,
      lastDigestAt: null,
    });

    const created = await this.gitConnectionRepository.create(connection);

    // The plaintext webhook secret is disclosed EXACTLY here and never again,
    // mirroring `CreateApiTokenUseCase`'s one-time token: `toJSON()` omits it by
    // design, so the only way back to it after this response is to rotate the
    // connection. Null for providers that deliver no signed webhooks.
    return {
      ...created.toJSON(),
      webhookSecret,
    };
  }
}
