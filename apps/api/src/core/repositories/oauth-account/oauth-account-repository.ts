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
  /**
   * Every provider linked to this account.
   *
   * Answers "did this user ever prove their address through an identity
   * provider", which is what keeps a LinkedIn user out of the email
   * verification gate — LinkedIn leaves no column on `users` the way Google's
   * `google_id` does, so the row here is the only evidence.
   */
  findByUserId(userId: string): Promise<OAuthAccountEntity[]>;
}
