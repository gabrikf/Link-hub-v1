import { UserEntity } from "../../entity/user/user-entity.js";
import { RefreshTokenEntity } from "../../entity/refresh-token/refresh-token-entity.js";
import { IUsersRepository } from "../../repositories/user/user-repository.js";
import { IRefreshTokenRepository } from "../../repositories/refresh-token/refresh-token-repository.js";
import { IHashProvider } from "../../providers/hash/hash-provider.js";
import { IJwtProvider } from "../../providers/jwt/jwt-provider.js";
import { InvalidCredentialsError } from "../../errors/index.js";
import { ILoginUseCaseInput } from "../types.js";

export class LoginUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private hashProvider: IHashProvider,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => ILoginUseCaseInput
  ) {}

  async execute(input: ILoginUseCaseInput) {
    // 1. Validate input
    const data = this.validator(input);

    // 2. Find user by email
    const user = await this.usersRepository.findByEmailOrLogin(data.email);

    if (!user) {
      throw new InvalidCredentialsError();
    }

    // 3. Verify password
    const isPasswordValid = await this.hashProvider.compare(
      data.password,
      user.password
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    // 4. Generate access token (JWT) - short-lived
    const accessToken = await this.jwtProvider.sign({ sub: user.id });

    // 5. Generate refresh token - long-lived (e.g., 7 days)
    const refreshTokenValue = crypto.randomUUID(); // Secure random token
    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7); // 7 days from now

    const refreshToken = RefreshTokenEntity.create({
      userId: user.id,
      token: refreshTokenValue,
      expiresAt: refreshTokenExpiresAt,
    });

    // 6. Save the refresh token to the database
    await this.refreshTokenRepository.create(refreshToken);

    // 7. Return the user, access token, and refresh token
    return {
      user: user.toPublic(),
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }
}
