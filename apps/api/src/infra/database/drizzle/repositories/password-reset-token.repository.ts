import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { PasswordResetTokenEntity } from "../../../../core/entity/password-reset-token/password-reset-token-entity.js";
import { IPasswordResetTokenRepository } from "../../../../core/repositories/password-reset-token/password-reset-token-repository.js";
import { db } from "../index.js";
import { passwordResetTokens } from "../schema.js";

type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;

/** Rows out, entities in. Every read path goes through here. */
function toEntity(row: PasswordResetTokenRow): PasswordResetTokenEntity {
  return new PasswordResetTokenEntity({
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzlePasswordResetTokenRepository
  implements IPasswordResetTokenRepository
{
  async create(
    token: PasswordResetTokenEntity,
  ): Promise<PasswordResetTokenEntity> {
    const [created] = await db
      .insert(passwordResetTokens)
      .values({
        id: token.id,
        userId: token.userId,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt,
        consumedAt: token.consumedAt,
        createdAt: token.createdAt,
        updatedAt: token.updatedAt,
      })
      .returning();

    return toEntity(created);
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<PasswordResetTokenEntity | null> {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash));

    if (!row) return null;

    return toEntity(row);
  }

  async findLatestByUserId(
    userId: string,
  ): Promise<PasswordResetTokenEntity | null> {
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, userId))
      .orderBy(desc(passwordResetTokens.createdAt))
      .limit(1);

    if (!row) return null;

    return toEntity(row);
  }

  async consumeAllForUser(userId: string, consumedAt: Date): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ consumedAt })
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          isNull(passwordResetTokens.consumedAt),
        ),
      );
  }

  async deleteExpired(): Promise<void> {
    await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()));
  }
}
