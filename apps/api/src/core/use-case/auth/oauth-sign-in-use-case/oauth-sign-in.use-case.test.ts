import { beforeEach, describe, expect, it, vi } from "vitest";
import { OAuthSignInUseCase } from "./oauth-sign-in.use-case.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryOAuthAccountRepository } from "../../../repositories/oauth-account/in-memory-oauth-account-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryHashProvider } from "../../../providers/hash/in-memory-hash-provider.js";
import { InMemoryJwtProvider } from "../../../providers/jwt/in-memory-jwt-provider.js";
import { IOAuthSignInUseCaseInput } from "../../types.js";
import { InvalidCredentialsError } from "../../../errors/index.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { OAuthAccountEntity } from "../../../entity/oauth-account/oauth-account-entity.js";

const mockValidator = vi.fn();

describe("OAuthSignInUseCase", () => {
  let usersRepository: InMemoryUsersRepository;
  let oauthAccountRepository: InMemoryOAuthAccountRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let hashProvider: InMemoryHashProvider;
  let jwtProvider: InMemoryJwtProvider;
  let sut: OAuthSignInUseCase;
  let validInput: IOAuthSignInUseCaseInput;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    oauthAccountRepository = new InMemoryOAuthAccountRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    hashProvider = new InMemoryHashProvider();
    jwtProvider = new InMemoryJwtProvider();

    sut = new OAuthSignInUseCase(
      usersRepository,
      oauthAccountRepository,
      refreshTokenRepository,
      hashProvider,
      jwtProvider,
      mockValidator,
    );

    validInput = {
      provider: "google",
      providerAccountId: "google-123",
      email: "oauth-user@example.com",
      name: "OAuth User",
      avatarUrl: "https://example.com/avatar.png",
      emailVerified: true,
    };

    vi.clearAllMocks();
    usersRepository.clear();
    oauthAccountRepository.clear();
    refreshTokenRepository.clear();
    jwtProvider.reset();
  });

  it("creates user, links oauth account and issues tokens", async () => {
    vi.mocked(mockValidator).mockReturnValue(validInput);

    const result = await sut.execute(validInput);

    expect(result.user.email).toBe(validInput.email);
    expect(result.user.name).toBe(validInput.name);
    expect(result.user.googleId).toBe(validInput.providerAccountId);
    expect(result.accessToken).toMatch(/^test_token_1_/);
    expect(result.refreshToken).toBeTypeOf("string");

    expect(usersRepository.count()).toBe(1);
    expect(oauthAccountRepository.count()).toBe(1);
    expect(refreshTokenRepository.count()).toBe(1);

    const linkedAccount = await oauthAccountRepository.findByProviderAccount(
      validInput.provider,
      validInput.providerAccountId,
    );
    expect(linkedAccount?.userId).toBe(result.user.id);
  });

  it("reuses existing user linked by oauth provider account", async () => {
    const existingUser = UserEntity.create({
      email: validInput.email,
      login: "existing-user",
      name: "Old Name",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(existingUser);

    await oauthAccountRepository.create(
      OAuthAccountEntity.create({
        userId: existingUser.id,
        provider: validInput.provider,
        providerAccountId: validInput.providerAccountId,
      }),
    );

    vi.mocked(mockValidator).mockReturnValue(validInput);

    const result = await sut.execute(validInput);

    expect(result.user.id).toBe(existingUser.id);
    expect(result.user.name).toBe(validInput.name);
    expect(result.user.avatarUrl).toBe(validInput.avatarUrl);
    expect(result.user.googleId).toBe(validInput.providerAccountId);
    expect(usersRepository.count()).toBe(1);
    expect(oauthAccountRepository.count()).toBe(1);
    expect(refreshTokenRepository.count()).toBe(1);
  });

  it("links existing user found by email when oauth account does not exist", async () => {
    const existingUser = UserEntity.create({
      email: validInput.email,
      login: "local-user",
      name: "Local Name",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(existingUser);

    vi.mocked(mockValidator).mockReturnValue(validInput);

    const result = await sut.execute(validInput);

    expect(result.user.id).toBe(existingUser.id);
    expect(result.user.googleId).toBe(validInput.providerAccountId);
    expect(oauthAccountRepository.count()).toBe(1);

    const linkedAccount = await oauthAccountRepository.findByUserAndProvider(
      existingUser.id,
      validInput.provider,
    );
    expect(linkedAccount?.providerAccountId).toBe(validInput.providerAccountId);
  });

  it("links existing user when the provider email differs only by case", async () => {
    // The account was created by hand with capitals; Google hands the same
    // mailbox back lowercased. It must be one account, not two.
    const existingUser = UserEntity.create({
      email: "Case.Split@Example.com",
      login: "local-user",
      name: "Local Name",
      password: "hashed-password",
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(existingUser);

    const lowercaseFromProvider: IOAuthSignInUseCaseInput = {
      ...validInput,
      email: "case.split@example.com",
    };
    vi.mocked(mockValidator).mockReturnValue(lowercaseFromProvider);

    const result = await sut.execute(lowercaseFromProvider);

    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe(existingUser.id);
    expect(usersRepository.count()).toBe(1);
  });

  it("throws when provider email is not verified", async () => {
    vi.mocked(mockValidator).mockReturnValue({
      ...validInput,
      emailVerified: false,
    });

    await expect(sut.execute(validInput)).rejects.toThrow(
      InvalidCredentialsError,
    );
    expect(usersRepository.count()).toBe(0);
    expect(refreshTokenRepository.count()).toBe(0);
  });


  describe("email verification", () => {
    it("marks a brand-new OAuth account verified at creation", async () => {
      vi.mocked(mockValidator).mockReturnValue(validInput);

      const result = await sut.execute(validInput);

      // The provider already confirmed the mailbox (the guard at the top of the
      // use case refuses an unconfirmed one), so asking the user to prove it a
      // second time by email would be theatre.
      expect(result.user.emailVerified).toBe(true);
      expect(usersRepository.getAll()[0].emailVerifiedAt).toBeInstanceOf(Date);
    });

    it("rescues an UNVERIFIED password account that signs in with the same address", async () => {
      // The escape hatch: someone registered with a password, never got the
      // email, and signs in with Google instead. Linking the provider proves
      // the address, so they are simply in.
      const passwordUser = UserEntity.create({
        email: validInput.email,
        login: "password-user",
        name: "Password User",
        password: "hashed_password123",
        description: null,
        avatarUrl: null,
        emailVerifiedAt: null,
        googleId: null,
      });
      await usersRepository.create(passwordUser);

      vi.mocked(mockValidator).mockReturnValue(validInput);

      const result = await sut.execute(validInput);

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe(passwordUser.id);
      expect(result.user.emailVerified).toBe(true);
      expect(usersRepository.getAll()[0].emailVerifiedAt).toBeInstanceOf(Date);
      // Still one account — the link did not create a second one.
      expect(usersRepository.count()).toBe(1);
    });

    it("does not rewrite the verification date on a returning user", async () => {
      const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
      const existing = UserEntity.create({
        email: validInput.email,
        login: "returning",
        name: "Returning",
        password: "hashed_password123",
        description: null,
        avatarUrl: null,
        emailVerifiedAt: verifiedAt,
        googleId: null,
      });
      await usersRepository.create(existing);
      await oauthAccountRepository.create(
        OAuthAccountEntity.create({
          userId: existing.id,
          provider: validInput.provider,
          providerAccountId: validInput.providerAccountId,
        }),
      );

      vi.mocked(mockValidator).mockReturnValue(validInput);

      await sut.execute(validInput);

      // Otherwise "when was this address proved" silently degrades into
      // "when did they last sign in".
      expect(usersRepository.getAll()[0].emailVerifiedAt).toEqual(verifiedAt);
    });
  });
});
