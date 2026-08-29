import { PasswordResetTokenEntity } from "../../entity/password-reset-token/password-reset-token-entity.js";
import { IPasswordResetTokenRepository } from "./password-reset-token-repository.js";

export class InMemoryPasswordResetTokenRepository
  implements IPasswordResetTokenRepository
{
  private tokens: PasswordResetTokenEntity[] = [];

  async create(
    token: PasswordResetTokenEntity,
  ): Promise<PasswordResetTokenEntity> {
    this.tokens.push(token);
    return token;
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenEntity | null> {
    return this.tokens.find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async findLatestByUserId(
    userId: string,
  ): Promise<PasswordResetTokenEntity | null> {
    const forUser = this.tokens
      .filter((token) => token.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return forUser[0] ?? null;
  }

  async consumeAllForUser(userId: string, consumedAt: Date): Promise<void> {
    for (const token of this.tokens) {
      if (token.userId === userId && !token.isConsumed()) {
        token.consume(consumedAt);
      }
    }
  }

  async deleteExpired(): Promise<void> {
    const now = new Date();
    this.tokens = this.tokens.filter((token) => !token.isExpired(now));
  }

  // Test helpers
  clear(): void {
    this.tokens = [];
  }

  getAll(): PasswordResetTokenEntity[] {
    return [...this.tokens];
  }

  count(): number {
    return this.tokens.length;
  }
}
