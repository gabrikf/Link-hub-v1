import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { EmailVerificationTokenEntity } from "../../../../core/entity/email-verification-token/email-verification-token-entity.js";
import { IEmailVerificationTokenRepository } from "../../../../core/repositories/email-verification-token/email-verification-token-repository.js";
import { db } from "../index.js";
import { emailVerificationTokens } from "../schema.js";
import { requireReturnedRow } from "../returned-row.js";

type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;

/** Rows out, entities in. Every read path goes through here. */
function toEntity(
  row: EmailVerificationTokenRow,
): EmailVerificationTokenEntity {
  return new EmailVerificationTokenEntity({
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleEmailVerificationTokenRepository
  implements IEmailVerificationTokenRepository
{
  async create(
    token: EmailVerificationTokenEntity,
  ): Promise<EmailVerificationTokenEntity> {
    const insertedRows = await db
      .insert(emailVerificationTokens)
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

    return toEntity(
      requireReturnedRow(insertedRows, "insert into emailVerificationTokens"),
    );
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenEntity | null> {
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash));

    if (!row) return null;

    return toEntity(row);
  }

  async findLatestByUserId(
    userId: string,
  ): Promise<EmailVerificationTokenEntity | null> {
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, userId))
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1);

    if (!row) return null;

    return toEntity(row);
  }

  async consumeAllForUser(userId: string, consumedAt: Date): Promise<void> {
    await db
      .update(emailVerificationTokens)
      .set({ consumedAt })
      .where(
        and(
          eq(emailVerificationTokens.userId, userId),
          isNull(emailVerificationTokens.consumedAt),
        ),
      );
  }

  async deleteExpired(): Promise<void> {
    await db
      .delete(emailVerificationTokens)
      .where(lt(emailVerificationTokens.expiresAt, new Date()));
  }
}
