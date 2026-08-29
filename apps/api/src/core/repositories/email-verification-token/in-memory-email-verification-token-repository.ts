import { EmailVerificationTokenEntity } from "../../entity/email-verification-token/email-verification-token-entity.js";
import { IEmailVerificationTokenRepository } from "./email-verification-token-repository.js";

export class InMemoryEmailVerificationTokenRepository
  implements IEmailVerificationTokenRepository
{
  private tokens: EmailVerificationTokenEntity[] = [];

  async create(
    token: EmailVerificationTokenEntity,
  ): Promise<EmailVerificationTokenEntity> {
    this.tokens.push(token);
    return token;
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenEntity | null> {
    return this.tokens.find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async findLatestByUserId(
    userId: string,
  ): Promise<EmailVerificationTokenEntity | null> {
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

  getAll(): EmailVerificationTokenEntity[] {
    return [...this.tokens];
  }

  count(): number {
    return this.tokens.length;
  }
}
