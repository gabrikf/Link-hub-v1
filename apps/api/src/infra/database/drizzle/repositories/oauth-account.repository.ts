import { and, eq } from "drizzle-orm";
import { OAuthAccountEntity } from "../../../../core/entity/oauth-account/oauth-account-entity.js";
import { IOAuthAccountRepository } from "../../../../core/repositories/oauth-account/oauth-account-repository.js";
import { db } from "../index.js";
import { oauthAccounts } from "../schema.js";

export class DrizzleOAuthAccountRepository implements IOAuthAccountRepository {
  async create(oauthAccount: OAuthAccountEntity): Promise<OAuthAccountEntity> {
    const [createdOAuthAccount] = await db
      .insert(oauthAccounts)
      .values({
        id: oauthAccount.id,
        userId: oauthAccount.userId,
        provider: oauthAccount.provider,
        providerAccountId: oauthAccount.providerAccountId,
        createdAt: oauthAccount.createdAt,
        updatedAt: oauthAccount.updatedAt,
      })
      .returning();

    return new OAuthAccountEntity({
      id: createdOAuthAccount.id,
      userId: createdOAuthAccount.userId,
      provider: createdOAuthAccount.provider,
      providerAccountId: createdOAuthAccount.providerAccountId,
      createdAt: createdOAuthAccount.createdAt,
      updatedAt: createdOAuthAccount.updatedAt,
    });
  }

  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountEntity | null> {
    const [oauthAccount] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.provider, provider),
          eq(oauthAccounts.providerAccountId, providerAccountId),
        ),
      );

    if (!oauthAccount) {
      return null;
    }

    return new OAuthAccountEntity({
      id: oauthAccount.id,
      userId: oauthAccount.userId,
      provider: oauthAccount.provider,
      providerAccountId: oauthAccount.providerAccountId,
      createdAt: oauthAccount.createdAt,
      updatedAt: oauthAccount.updatedAt,
    });
  }

  async findByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<OAuthAccountEntity | null> {
    const [oauthAccount] = await db
      .select()
      .from(oauthAccounts)
      .where(
        and(
          eq(oauthAccounts.userId, userId),
          eq(oauthAccounts.provider, provider),
        ),
      );

    if (!oauthAccount) {
      return null;
    }

    return new OAuthAccountEntity({
      id: oauthAccount.id,
      userId: oauthAccount.userId,
      provider: oauthAccount.provider,
      providerAccountId: oauthAccount.providerAccountId,
      createdAt: oauthAccount.createdAt,
      updatedAt: oauthAccount.updatedAt,
    });
  }
}
