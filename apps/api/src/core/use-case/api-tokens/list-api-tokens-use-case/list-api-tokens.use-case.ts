import { IApiTokenRepository } from "../../../repositories/api-token/api-token-repository.js";

export class ListApiTokensUseCase {
  constructor(private apiTokenRepository: IApiTokenRepository) {}

  async execute(userId: string) {
    return this.apiTokenRepository.listByUserId(userId);
  }
}
