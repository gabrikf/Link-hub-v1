import { desc, eq } from "drizzle-orm";
import { ApiTokenEntity } from "../../../../core/entity/api-token/api-token-entity.js";
import { IApiTokenRepository } from "../../../../core/repositories/api-token/api-token-repository.js";
import { db } from "../index.js";
import { apiTokens } from "../schema.js";

type ApiTokenRow = typeof apiTokens.$inferSelect;

function toEntity(row: ApiTokenRow): ApiTokenEntity {
  return new ApiTokenEntity({
    id: row.id,
    userId: row.userId,
    name: row.name,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    scopes: (row.scopes as string[] | null) ?? [],
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    // api_tokens has no updated_at column; BaseEntity requires one.
    updatedAt: row.createdAt,
  });
}

export class DrizzleApiTokenRepository implements IApiTokenRepository {
  async create(apiToken: ApiTokenEntity): Promise<ApiTokenEntity> {
    const [created] = await db
      .insert(apiTokens)
      .values({
        id: apiToken.id,
        userId: apiToken.userId,
        name: apiToken.name,
        tokenHash: apiToken.tokenHash,
        tokenPrefix: apiToken.tokenPrefix,
        scopes: apiToken.scopes,
        expiresAt: apiToken.expiresAt,
        lastUsedAt: apiToken.lastUsedAt,
        revokedAt: apiToken.revokedAt,
        createdAt: apiToken.createdAt,
      })
      .returning();

    return toEntity(created);
  }

  async findByTokenHash(tokenHash: string): Promise<ApiTokenEntity | null> {
    const [row] = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash));

    if (!row) {
      return null;
    }

    return toEntity(row);
  }

  async findById(id: string): Promise<ApiTokenEntity | null> {
    const [row] = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.id, id));

    if (!row) {
      return null;
    }

    return toEntity(row);
  }

  async listByUserId(userId: string): Promise<ApiTokenEntity[]> {
    const rows = await db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, userId))
      .orderBy(desc(apiTokens.createdAt));

    return rows.map(toEntity);
  }

  async revoke(id: string): Promise<void> {
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.id, id));
  }

  async touchLastUsed(id: string): Promise<void> {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, id));
  }
}
