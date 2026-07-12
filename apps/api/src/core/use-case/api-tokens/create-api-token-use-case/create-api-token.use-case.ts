import { ApiTokenEntity } from "../../../entity/api-token/api-token-entity.js";
import { ResourceNotFoundError } from "../../../errors/index.js";
import { ITokenProvider } from "../../../providers/token/token-provider.js";
import { IApiTokenRepository } from "../../../repositories/api-token/api-token-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";

export interface ICreateApiTokenInput {
  userId: string;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
}

export class CreateApiTokenUseCase {
  constructor(
    private apiTokenRepository: IApiTokenRepository,
    private usersRepository: IUsersRepository,
    private tokenProvider: ITokenProvider,
  ) {}

  async execute(input: ICreateApiTokenInput) {
    const user = await this.usersRepository.findById(input.userId);

    if (!user) {
      throw new ResourceNotFoundError("User", input.userId);
    }

    const { token, tokenHash, tokenPrefix } = this.tokenProvider.generate();

    const apiToken = ApiTokenEntity.create({
      userId: input.userId,
      name: input.name,
      tokenHash,
      tokenPrefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
    });

    const created = await this.apiTokenRepository.create(apiToken);

    // The plaintext token is returned ONLY here; it is never stored or exposed
    // again.
    return {
      ...created.toJSON(),
      token,
    };
  }
}
