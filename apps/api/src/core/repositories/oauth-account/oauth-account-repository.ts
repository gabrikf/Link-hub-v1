import { OAuthAccountEntity } from "../../entity/oauth-account/oauth-account-entity.js";

export interface IOAuthAccountRepository {
  create(oauthAccount: OAuthAccountEntity): Promise<OAuthAccountEntity>;
  findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<OAuthAccountEntity | null>;
  findByUserAndProvider(
    userId: string,
    provider: string,
  ): Promise<OAuthAccountEntity | null>;
}
