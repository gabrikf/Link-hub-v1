import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleSignInUseCase } from "./google-sign-in.use-case.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryOAuthAccountRepository } from "../../../repositories/oauth-account/in-memory-oauth-account-repository.js";
import { InMemoryJwtProvider } from "../../../providers/jwt/in-memory-jwt-provider.js";
import { InMemoryHashProvider } from "../../../providers/hash/in-memory-hash-provider.js";
import { OAuthSignInUseCase } from "../oauth-sign-in-use-case/oauth-sign-in.use-case.js";
import {
  GoogleUserInfo,
  IGoogleOAuthProvider,
} from "../../../providers/oauth/google-oauth-provider.js";
import { IGoogleSignInUseCaseInput } from "../../types.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import {
  InvalidCredentialsError,
  UnauthorizedError,
} from "../../../errors/index.js";

class InMemoryGoogleOAuthProvider implements IGoogleOAuthProvider {
  private userInfo: GoogleUserInfo | null = null;
  private shouldThrow = false;

  setUserInfo(userInfo: GoogleUserInfo) {
    this.userInfo = userInfo;
  }

  setShouldThrow(value: boolean) {
    this.shouldThrow = value;
  }

  async verifyIdToken(): Promise<GoogleUserInfo> {
    if (this.shouldThrow || !this.userInfo) {
      throw new Error("Invalid Google token");
    }

    return this.userInfo;
  }

  async verifyAccessToken(): Promise<GoogleUserInfo> {
    if (this.shouldThrow || !this.userInfo) {
      throw new Error("Invalid Google token");
    }

    return this.userInfo;
  }
}

const mockValidator = vi.fn();

describe("GoogleSignInUseCase", () => {
  let useCase: GoogleSignInUseCase;
  let usersRepository: InMemoryUsersRepository;
  let oauthAccountRepository: InMemoryOAuthAccountRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let jwtProvider: InMemoryJwtProvider;
  let hashProvider: InMemoryHashProvider;
  let googleOAuthProvider: InMemoryGoogleOAuthProvider;
  let oauthSignInUseCase: OAuthSignInUseCase;
  let validInput: IGoogleSignInUseCaseInput;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    oauthAccountRepository = new InMemoryOAuthAccountRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    jwtProvider = new InMemoryJwtProvider();
    hashProvider = new InMemoryHashProvider();
    googleOAuthProvider = new InMemoryGoogleOAuthProvider();

    oauthSignInUseCase = new OAuthSignInUseCase(
      usersRepository,
      oauthAccountRepository,
      refreshTokenRepository,
      hashProvider,
      jwtProvider,
      (input) => input as any,
    );

    useCase = new GoogleSignInUseCase(
      googleOAuthProvider,
      oauthSignInUseCase,
      mockValidator,
    );

    validInput = {
      idToken: "google-id-token",
    };

    vi.clearAllMocks();
    refreshTokenRepository.clear();
    jwtProvider.reset();

    googleOAuthProvider.setUserInfo({
      googleId: "google-123",
      email: "google-user@example.com",
      name: "Google User",
      avatarUrl: "https://example.com/avatar.png",
      emailVerified: true,
    });
  });

  it("creates a new user when no matching account exists", async () => {
    vi.mocked(mockValidator).mockReturnValue(validInput);

    const result = await useCase.execute(validInput);

    expect(result.user.email).toBe("google-user@example.com");
    expect(result.user.googleId).toBe("google-123");
    expect(result.user.name).toBe("Google User");
    expect(result.user.avatarUrl).toBe("https://example.com/avatar.png");
    expect(result.accessToken).toMatch(/^test_token_1_/);
    expect(result.refreshToken).toBeTypeOf("string");
    expect(usersRepository.count()).toBe(1);
    expect(refreshTokenRepository.count()).toBe(1);
  });

  it("logs in an existing user already linked with googleId", async () => {
    const existingUser = UserEntity.create({
      email: "google-user@example.com",
      login: "existing-google",
      name: "Old Name",
      password: "irrelevant-password",
      description: null,
      avatarUrl: null,
      googleId: "google-123",
    });

    await usersRepository.create(existingUser);

    vi.mocked(mockValidator).mockReturnValue(validInput);

    const result = await useCase.execute(validInput);

    expect(result.user.id).toBe(existingUser.id);
    expect(result.user.name).toBe("Google User");
    expect(result.user.avatarUrl).toBe("https://example.com/avatar.png");
    expect(refreshTokenRepository.count()).toBe(1);
  });

  it("links an existing user found by email and syncs profile", async () => {
    const existingUser = UserEntity.create({
      email: "google-user@example.com",
      login: "local-user",
      name: "Legacy Name",
      password: "legacy-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });

    await usersRepository.create(existingUser);

    vi.mocked(mockValidator).mockReturnValue(validInput);

    const result = await useCase.execute(validInput);

    expect(result.user.id).toBe(existingUser.id);
    expect(result.user.googleId).toBe("google-123");
    expect(result.user.name).toBe("Google User");
    expect(result.user.avatarUrl).toBe("https://example.com/avatar.png");

    const storedUser = await usersRepository.findByGoogleId("google-123");
    expect(storedUser?.id).toBe(existingUser.id);
  });

  it("throws UnauthorizedError when Google token verification fails", async () => {
    googleOAuthProvider.setShouldThrow(true);
    vi.mocked(mockValidator).mockReturnValue(validInput);

    await expect(useCase.execute(validInput)).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("throws InvalidCredentialsError when Google email is not verified", async () => {
    googleOAuthProvider.setUserInfo({
      googleId: "google-123",
      email: "google-user@example.com",
      name: "Google User",
      avatarUrl: null,
      emailVerified: false,
    });

    vi.mocked(mockValidator).mockReturnValue(validInput);

    await expect(useCase.execute(validInput)).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("stores refresh token with roughly seven day expiration", async () => {
    const before = new Date();
    vi.mocked(mockValidator).mockReturnValue(validInput);

    await useCase.execute(validInput);

    const refreshTokens = refreshTokenRepository.getAll();
    expect(refreshTokens).toHaveLength(1);

    const expiresAt = refreshTokens[0].expiresAt;
    const expected = new Date(before);
    expected.setDate(expected.getDate() + 7);

    const diff = Math.abs(expiresAt.getTime() - expected.getTime());
    expect(diff).toBeLessThan(1000);
  });
});
