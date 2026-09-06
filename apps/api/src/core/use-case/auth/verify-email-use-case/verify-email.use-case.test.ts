import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailUseCase } from "./verify-email.use-case.js";
import { EmailVerificationTokenEntity } from "../../../entity/email-verification-token/email-verification-token-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InvalidVerificationTokenError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryEmailVerificationTokenRepository } from "../../../repositories/email-verification-token/in-memory-email-verification-token-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryTokenProvider } from "../../../providers/token/in-memory-token-provider.js";
import { InMemoryJwtProvider } from "../../../providers/jwt/in-memory-jwt-provider.js";

const HOUR_MS = 60 * 60 * 1000;

describe("VerifyEmailUseCase", () => {
  const validator = vi.fn();

  let useCase: VerifyEmailUseCase;
  let usersRepository: InMemoryUsersRepository;
  let tokenRepository: InMemoryEmailVerificationTokenRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let tokenProvider: InMemoryTokenProvider;
  let user: UserEntity;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    tokenRepository = new InMemoryEmailVerificationTokenRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    tokenProvider = new InMemoryTokenProvider();

    useCase = new VerifyEmailUseCase(
      usersRepository,
      tokenRepository,
      refreshTokenRepository,
      tokenProvider,
      new InMemoryJwtProvider(),
      validator,
    );

    user = UserEntity.create({
      email: "new@example.com",
      login: "newuser",
      name: "New User",
      password: "hashed_password123",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: null,
      googleId: null,
    });
    await usersRepository.create(user);

    vi.clearAllMocks();
  });

  /** Mint a token the way CreateUserUseCase does, and hand back the raw half. */
  async function mintToken(overrides?: {
    expiresAt?: Date;
    consumedAt?: Date | null;
  }): Promise<string> {
    const rawToken = tokenProvider.generateOpaqueToken();

    await tokenRepository.create(
      EmailVerificationTokenEntity.create({
        userId: user.id,
        tokenHash: tokenProvider.hash(rawToken),
        expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 24 * HOUR_MS),
        consumedAt: overrides?.consumedAt ?? null,
      }),
    );

    return rawToken;
  }

  function useToken(rawToken: string) {
    vi.mocked(validator).mockReturnValue({ token: rawToken });
    return useCase.execute({ token: rawToken });
  }

  it("verifies the account, consumes the token and returns a session", async () => {
    const rawToken = await mintToken();

    const result = await useToken(rawToken);

    const stored = await usersRepository.findById(user.id);
    expect(stored?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(result.user.emailVerified).toBe(true);

    // Verifying is what mints the first session a password account ever gets.
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(refreshTokenRepository.count()).toBe(1);
    expect(refreshTokenRepository.getAll()[0]?.userId).toBe(user.id);

    expect(tokenRepository.getAll()[0]?.consumedAt).toBeInstanceOf(Date);
  });

  it("refuses the SAME token a second time", async () => {
    const rawToken = await mintToken();

    await useToken(rawToken);

    // A verification link lives in an inbox forever. Replaying it must not
    // mint a second session — that would make a forwarded email a login.
    await expect(useToken(rawToken)).rejects.toBeInstanceOf(
      InvalidVerificationTokenError,
    );
    expect(refreshTokenRepository.count()).toBe(1);
  });

  it("refuses an expired token", async () => {
    const rawToken = await mintToken({
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    await expect(useToken(rawToken)).rejects.toBeInstanceOf(
      InvalidVerificationTokenError,
    );

    const stored = await usersRepository.findById(user.id);
    expect(stored?.emailVerifiedAt).toBeNull();
  });

  it("refuses an unknown token with the same 400 as an expired one", async () => {
    await mintToken();

    const unknown = tokenProvider.generateOpaqueToken();

    // Byte-identical answers on purpose: a different message or status would
    // confirm to someone guessing tokens that a guess had once been real.
    const expired = await mintToken({
      expiresAt: new Date(Date.now() - HOUR_MS),
    });

    const unknownError = await useToken(unknown).catch(
      (error: unknown) => error,
    );
    const expiredError = await useToken(expired).catch(
      (error: unknown) => error,
    );

    expect(unknownError).toBeInstanceOf(InvalidVerificationTokenError);
    expect(expiredError).toBeInstanceOf(InvalidVerificationTokenError);
    expect((unknownError as Error).message).toBe(
      (expiredError as Error).message,
    );
    expect(unknownError).toMatchObject({
      statusCode: 400,
      errorCode: "INVALID_VERIFICATION_TOKEN",
    });
  });

  it("invalidates the user's OTHER outstanding tokens on success", async () => {
    // Someone who pressed "resend" twice has three live links in one inbox.
    const first = await mintToken();
    const second = await mintToken();
    const third = await mintToken();

    await useToken(second);

    expect(tokenRepository.getAll().every((token) => token.isConsumed())).toBe(
      true,
    );

    for (const stale of [first, third]) {
      await expect(useToken(stale)).rejects.toBeInstanceOf(
        InvalidVerificationTokenError,
      );
    }
  });

  it("leaves another user's tokens alone", async () => {
    const other = UserEntity.create({
      email: "other@example.com",
      login: "other",
      name: "Other",
      password: "hashed_password123",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: null,
      googleId: null,
    });
    await usersRepository.create(other);

    const otherRaw = tokenProvider.generateOpaqueToken();
    await tokenRepository.create(
      EmailVerificationTokenEntity.create({
        userId: other.id,
        tokenHash: tokenProvider.hash(otherRaw),
        expiresAt: new Date(Date.now() + 24 * HOUR_MS),
        consumedAt: null,
      }),
    );

    await useToken(await mintToken());

    // `consumeAllForUser` scoped to one user, not "all outstanding tokens".
    const otherToken = await tokenRepository.findByTokenHash(
      tokenProvider.hash(otherRaw),
    );
    expect(otherToken?.isConsumed()).toBe(false);
  });
});
