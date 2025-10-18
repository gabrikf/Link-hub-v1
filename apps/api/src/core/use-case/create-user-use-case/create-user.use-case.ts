import { UserEntity } from "../../entity/user/user-entity.js";
import { RefreshTokenEntity } from "../../entity/refresh-token/refresh-token-entity.js";
import { IUsersRepository } from "../../repositories/user/user-repository.js";
import { IRefreshTokenRepository } from "../../repositories/refresh-token/refresh-token-repository.js";
import { IHashProvider } from "../../providers/hash/hash-provider.js";
import { IJwtProvider } from "../../providers/jwt/jwt-provider.js";
import { DuplicateResourceError } from "../../errors/index.js";
import { ICreateUserUseCaseInput } from "../types.js";

export class CreateUserUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private refreshTokenRepository: IRefreshTokenRepository,
    private hashProvider: IHashProvider,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => ICreateUserUseCaseInput
  ) {}

  // This is where the core logic happens
  async execute(input: ICreateUserUseCaseInput) {
    // 1. Validate input (already handled by Zod in the controller, but good practice)
    const data = this.validator(input);

    // 2. Check if user already exists (parallel execution)
    const [userWithSameEmail, userWithSameLogin] = await Promise.all([
      this.usersRepository.findByEmailOrLogin(data.email),
      this.usersRepository.findByEmailOrLogin(data.login),
    ]);

    if (userWithSameEmail) {
      throw new DuplicateResourceError("User", "email", data.email);
    }

    if (userWithSameLogin) {
      throw new DuplicateResourceError("User", "login", data.login);
    }

    // 3. Hash the password
    const passwordHash = await this.hashProvider.hash(data.password);

    // 4. Create a new user entity
    const user = UserEntity.create({
      email: data.email,
      login: data.login,
      name: data.name,
      password: passwordHash,
      description: data.description ?? null,
      avatarUrl: data.avatarUrl ?? null,
      googleId: null,
    });

    // 5. Save the user to the database
    const createdUser = await this.usersRepository.create(user);

    // 6. Generate access token (JWT) - short-lived
    const accessToken = await this.jwtProvider.sign({ sub: createdUser.id });

    // 7. Generate refresh token - long-lived (e.g., 7 days)
    const refreshTokenValue = crypto.randomUUID(); // Secure random token
    const refreshTokenExpiresAt = new Date();
    refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7); // 7 days from now

    const refreshToken = RefreshTokenEntity.create({
      userId: createdUser.id,
      token: refreshTokenValue,
      expiresAt: refreshTokenExpiresAt,
    });

    // 8. Save the refresh token to the database
    await this.refreshTokenRepository.create(refreshToken);

    // 9. Return the user, access token, and refresh token
    return {
      user: createdUser.toPublic(),
      accessToken,
      refreshToken: refreshTokenValue,
    };
  }
}
