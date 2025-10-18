import { RefreshTokenEntity } from "../../entity/refresh-token/refresh-token-entity.js";
import { IRefreshTokenRepository } from "./refresh-token-repository.js";

export class InMemoryRefreshTokenRepository implements IRefreshTokenRepository {
  private tokens: RefreshTokenEntity[] = [];

  async create(refreshToken: RefreshTokenEntity): Promise<RefreshTokenEntity> {
    this.tokens.push(refreshToken);
    return refreshToken;
  }

  async findByToken(token: string): Promise<RefreshTokenEntity | null> {
    const refreshToken = this.tokens.find((t) => t.token === token);
    return refreshToken || null;
  }

  async findByUserId(userId: string): Promise<RefreshTokenEntity[]> {
    return this.tokens.filter((t) => t.userId === userId);
  }

  async deleteByToken(token: string): Promise<void> {
    const index = this.tokens.findIndex((t) => t.token === token);
    if (index !== -1) {
      this.tokens.splice(index, 1);
    }
  }

  async deleteByUserId(userId: string): Promise<void> {
    this.tokens = this.tokens.filter((t) => t.userId !== userId);
  }

  async deleteExpired(): Promise<void> {
    const now = new Date();
    this.tokens = this.tokens.filter((t) => t.expiresAt > now);
  }

  // Test helpers
  clear(): void {
    this.tokens = [];
  }

  getAll(): RefreshTokenEntity[] {
    return [...this.tokens];
  }

  count(): number {
    return this.tokens.length;
  }
}
