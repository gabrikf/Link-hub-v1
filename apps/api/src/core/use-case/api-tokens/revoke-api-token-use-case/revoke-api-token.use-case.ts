import {
  ForbiddenError,
  ResourceNotFoundError,
} from "../../../errors/index.js";
import { IApiTokenRepository } from "../../../repositories/api-token/api-token-repository.js";

export class RevokeApiTokenUseCase {
  constructor(private apiTokenRepository: IApiTokenRepository) {}

  async execute(userId: string, tokenId: string) {
    const apiToken = await this.apiTokenRepository.findById(tokenId);

    if (!apiToken) {
      throw new ResourceNotFoundError("ApiToken", tokenId);
    }

    if (apiToken.userId !== userId) {
      throw new ForbiddenError("You do not have access to this token");
    }

    await this.apiTokenRepository.revoke(tokenId);

    return { success: true };
  }
}
