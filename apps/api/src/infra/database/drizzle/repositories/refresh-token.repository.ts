import { eq, lt } from "drizzle-orm";
import { RefreshTokenEntity } from "../../../../core/entity/refresh-token/refresh-token-entity.js";
import { IRefreshTokenRepository } from "../../../../core/repositories/refresh-token/refresh-token-repository.js";
import { db } from "../index.js";
import { refreshTokens } from "../schema.js";

export class DrizzleRefreshTokenRepository implements IRefreshTokenRepository {
  async create(refreshToken: RefreshTokenEntity): Promise<RefreshTokenEntity> {
    const [createdToken] = await db
      .insert(refreshTokens)
      .values({
        id: refreshToken.id,
        userId: refreshToken.userId,
        token: refreshToken.token,
        expiresAt: refreshToken.expiresAt,
        createdAt: refreshToken.createdAt,
        updatedAt: refreshToken.updatedAt,
      })
      .returning();

    return new RefreshTokenEntity({
      id: createdToken.id,
      userId: createdToken.userId,
      token: createdToken.token,
      expiresAt: createdToken.expiresAt,
      createdAt: createdToken.createdAt,
      updatedAt: createdToken.updatedAt,
    });
  }

  async findByToken(token: string): Promise<RefreshTokenEntity | null> {
    const [refreshToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token));

    if (!refreshToken) return null;

    return new RefreshTokenEntity({
      id: refreshToken.id,
      userId: refreshToken.userId,
      token: refreshToken.token,
      expiresAt: refreshToken.expiresAt,
      createdAt: refreshToken.createdAt,
      updatedAt: refreshToken.updatedAt,
    });
  }

  async findByUserId(userId: string): Promise<RefreshTokenEntity[]> {
    const tokens = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId));

    return tokens.map(
      (token) =>
        new RefreshTokenEntity({
          id: token.id,
          userId: token.userId,
          token: token.token,
          expiresAt: token.expiresAt,
          createdAt: token.createdAt,
          updatedAt: token.updatedAt,
        })
    );
  }

  async deleteByToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteByUserId(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  async deleteExpired(): Promise<void> {
    await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()));
  }
}
