import { OAuthAccountEntity } from "../../../entity/oauth-account/oauth-account-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InvalidCredentialsError } from "../../../errors/index.js";
import { IHashProvider } from "../../../providers/hash/hash-provider.js";
import { IJwtProvider } from "../../../providers/jwt/jwt-provider.js";
import { IOAuthAccountRepository } from "../../../repositories/oauth-account/oauth-account-repository.js";
import { IRefreshTokenRepository } from "../../../repositories/refresh-token/refresh-token-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IOAuthSignInUseCaseInput } from "../../types.js";
import { issueSession } from "../issue-session.js";

export class OAuthSignInUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private oauthAccountRepository: IOAuthAccountRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private hashProvider: IHashProvider,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => IOAuthSignInUseCaseInput,
  ) {}

  private createLoginFromEmail(email: string): string {
    return email
      .split("@")[0]
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .toLowerCase();
  }

  async execute(input: IOAuthSignInUseCaseInput) {
    const data = this.validator(input);

    if (!data.emailVerified) {
      throw new InvalidCredentialsError(
        `${data.provider} account email is not verified`,
      );
    }

    const existingOAuthAccount =
      await this.oauthAccountRepository.findByProviderAccount(
        data.provider,
        data.providerAccountId,
      );

    let user = existingOAuthAccount
      ? await this.usersRepository.findById(existingOAuthAccount.userId)
      : null;

    /**
     * Whether this call created the account, as opposed to signing an existing
     * one back in. Exposed on the result purely so the controller can tell a
     * signup from a login when counting the product funnel — without it, every
     * returning Google user would be counted as a new registration and the
     * signup metric would just be a login metric with a different name.
     */
    let isNewUser = false;

    if (!user) {
      user = await this.usersRepository.findByEmail(data.email);

      if (!user) {
        isNewUser = true;
        const generatedPassword = crypto.randomUUID();
        const passwordHash = await this.hashProvider.hash(generatedPassword);
        const baseLogin = this.createLoginFromEmail(data.email);
        let login = baseLogin.length > 0 ? baseLogin : `user-${Date.now()}`;

        const existingLogin =
          await this.usersRepository.findByEmailOrLogin(login);
        if (existingLogin) {
          login = `${login}-${crypto.randomUUID().slice(0, 8)}`;
        }

        user = await this.usersRepository.create(
          UserEntity.create({
            email: data.email,
            login,
            name: data.name,
            password: passwordHash,
            avatarUrl: data.avatarUrl,
            description: null,
            googleId:
              data.provider === "google" ? data.providerAccountId : null,
            // Verified at creation: the guard at the top of this method already
            // refused a provider profile whose email was not confirmed, so the
            // provider has proved control of this mailbox. Sending our own
            // verification email on top of that would be asking the user to
            // prove something we already know.
            emailVerifiedAt: new Date(),
          }),
        );
      }

      const userProviderAccount =
        await this.oauthAccountRepository.findByUserAndProvider(
          user.id,
          data.provider,
        );

      if (!userProviderAccount) {
        await this.oauthAccountRepository.create(
          OAuthAccountEntity.create({
            userId: user.id,
            provider: data.provider,
            providerAccountId: data.providerAccountId,
          }),
        );
      }
    }

    user.name = data.name;
    user.updateAvatarUrl(data.avatarUrl);
    if (data.provider === "google") {
      user.updateGoogleId(data.providerAccountId);
    }
    /**
     * Covers the case the creation branch above cannot: an UNVERIFIED password
     * account that just linked this provider by matching email. The provider
     * has proved control of the address, so the account is verified from here —
     * and this is the escape hatch for a user whose verification email never
     * arrived. They sign in with Google or LinkedIn and are simply in.
     *
     * `markEmailVerified` is idempotent, so a returning OAuth user keeps the
     * original date rather than having it rewritten on every sign-in.
     */
    user.markEmailVerified();
    user = await this.usersRepository.update(user);

    const session = await issueSession({
      jwtProvider: this.jwtProvider,
      refreshTokenRepository: this.refreshTokenRepository,
      userId: user.id,
    });

    return {
      user: user.toPublic(),
      ...session,
      isNewUser,
    };
  }
}
