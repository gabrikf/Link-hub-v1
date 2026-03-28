import { OAuthAccountEntity } from "../../entity/oauth-account/oauth-account-entity.js";
import { IOAuthAccountRepository } from "./oauth-account-repository.js";

export class InMemoryOAuthAccountRepository implements IOAuthAccountRepository {
  private oauthAccounts: OAuthAccountEntity[] = [];

  async create(oauthAccount: OAuthAccountEntity): Promise<OAuthAccountEntity> {
    this.oauthAccounts.push(oauthAccount);
    return oauthAccount;
  }

  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountEntity | null> {
    const oauthAccount = this.oauthAccounts.find(
      (candidate) =>
        candidate.provider === provider &&
        candidate.providerAccountId === providerAccountId,
    );

    return oauthAccount || null;
  }

  async findByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<OAuthAccountEntity | null> {
    const oauthAccount = this.oauthAccounts.find(
      (candidate) =>
        candidate.userId === userId && candidate.provider === provider,
    );

    return oauthAccount || null;
  }

  clear(): void {
    this.oauthAccounts = [];
  }

  count(): number {
    return this.oauthAccounts.length;
  }
}
