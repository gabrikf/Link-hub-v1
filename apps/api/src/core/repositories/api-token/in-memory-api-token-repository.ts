import { ApiTokenEntity } from "../../entity/api-token/api-token-entity.js";
import { IApiTokenRepository } from "./api-token-repository.js";

export class InMemoryApiTokenRepository implements IApiTokenRepository {
  private tokens: ApiTokenEntity[] = [];

  async create(apiToken: ApiTokenEntity): Promise<ApiTokenEntity> {
    this.tokens.push(apiToken);
    return apiToken;
  }

  async findByTokenHash(tokenHash: string): Promise<ApiTokenEntity | null> {
    const token = this.tokens.find(
      (candidate) => candidate.tokenHash === tokenHash,
    );
    return token ?? null;
  }

  async findById(id: string): Promise<ApiTokenEntity | null> {
    const token = this.tokens.find((candidate) => candidate.id === id);
    return token ?? null;
  }

  async listByUserId(userId: string): Promise<ApiTokenEntity[]> {
    return this.tokens
      .filter((candidate) => candidate.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async revoke(id: string): Promise<void> {
    const token = this.tokens.find((candidate) => candidate.id === id);
    if (token) {
      token.revoke();
    }
  }

  async touchLastUsed(id: string): Promise<void> {
    const token = this.tokens.find((candidate) => candidate.id === id);
    if (token) {
      token.touchLastUsed();
    }
  }

  getAll() {
    return [...this.tokens];
  }

  clear() {
    this.tokens = [];
  }
}
