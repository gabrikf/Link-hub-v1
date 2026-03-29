import { OAuthAccountEntity } from "../../../entity/oauth-account/oauth-account-entity.js";
import { RefreshTokenEntity } from "../../../entity/refresh-token/refresh-token-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InvalidCredentialsError } from "../../../errors/index.js";
import { IHashProvider } from "../../../providers/hash/hash-provider.js";
import { IJwtProvider } from "../../../providers/jwt/jwt-provider.js";
import { IOAuthAccountRepository } from "../../../repositories/oauth-account/oauth-account-repository.js";
import { IRefreshTokenRepository } from "../../../repositories/refresh-token/refresh-token-repository.js";
import { IUsersRepository } from "../../../repositories/user/user-repository.js";
import { IOAuthSignInUseCaseInput } from "../../types.js";

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

    if (!user) {
      user = await this.usersRepository.findByEmail(data.email);

      if (!user) {
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
    user = await this.usersRepository.update(user);

    const accessToken = await this.jwtProvider.sign({ sub: user.id });

    const refreshTokenValue = crypto.randomUUID();
    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7);

    await this.refreshTokenRepository.create(
      RefreshTokenEntity.create({
        userId: user.id,
        token: refreshTokenValue,
        expiresAt: refreshTokenExpiresAt,
      }),
    );

    return {
      user: user.toPublic(),
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }
}
