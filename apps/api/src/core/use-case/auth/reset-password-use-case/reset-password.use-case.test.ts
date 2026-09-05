import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResetPasswordUseCase } from "./reset-password.use-case.js";
import { PasswordResetTokenEntity } from "../../../entity/password-reset-token/password-reset-token-entity.js";
import { RefreshTokenEntity } from "../../../entity/refresh-token/refresh-token-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InvalidResetTokenError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryPasswordResetTokenRepository } from "../../../repositories/password-reset-token/in-memory-password-reset-token-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryHashProvider } from "../../../providers/hash/in-memory-hash-provider.js";
import { InMemoryTokenProvider } from "../../../providers/token/in-memory-token-provider.js";

const MINUTE_MS = 60 * 1000;
const NEW_PASSWORD = "brand-new-password";

describe("ResetPasswordUseCase", () => {
  const validator = vi.fn();

  let useCase: ResetPasswordUseCase;
  let usersRepository: InMemoryUsersRepository;
  let tokenRepository: InMemoryPasswordResetTokenRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let tokenProvider: InMemoryTokenProvider;
  let user: UserEntity;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    tokenRepository = new InMemoryPasswordResetTokenRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    tokenProvider = new InMemoryTokenProvider();

    useCase = new ResetPasswordUseCase(
      usersRepository,
      tokenRepository,
      refreshTokenRepository,
      new InMemoryHashProvider(),
      tokenProvider,
      validator,
    );

    user = UserEntity.create({
      email: "forgetful@example.com",
      login: "forgetful",
      name: "Forgetful User",
      password: "hashed_old-password",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: new Date(),
      googleId: null,
    });
    await usersRepository.create(user);

    vi.clearAllMocks();
    vi.mocked(validator).mockImplementation((input: unknown) => input as never);
  });

  async function mintToken(overrides?: {
    userId?: string;
    expiresAt?: Date;
    consumedAt?: Date | null;
  }): Promise<string> {
    const rawToken = tokenProvider.generateOpaqueToken();

    await tokenRepository.create(
      PasswordResetTokenEntity.create({
        userId: overrides?.userId ?? user.id,
        tokenHash: tokenProvider.hash(rawToken),
        expiresAt:
          overrides?.expiresAt ?? new Date(Date.now() + 20 * MINUTE_MS),
        consumedAt: overrides?.consumedAt ?? null,
      }),
    );

    return rawToken;
  }

  const reset = (token: string, password = NEW_PASSWORD) =>
    useCase.execute({ token, password });

  it("stores the new password and consumes the token", async () => {
    const rawToken = await mintToken();

    const result = await reset(rawToken);

    expect(result).toEqual({ status: "reset" });

    const stored = await usersRepository.findById(user.id);
    // Hashed, never the plaintext the request carried.
    expect(stored?.password).toBe(`hashed_${NEW_PASSWORD}`);
    expect(stored?.password).not.toBe(NEW_PASSWORD);

    expect(tokenRepository.getAll()[0]?.isConsumed()).toBe(true);
  });

  it("revokes EVERY refresh token for the account", async () => {
    for (const token of ["session-a", "session-b"]) {
      await refreshTokenRepository.create(
        RefreshTokenEntity.create({
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * MINUTE_MS),
        }),
      );
    }

    await reset(await mintToken());

    // The realistic case is an already-compromised account: an attacker holding
    // a refresh token can mint access tokens forever, so a password change that
    // leaves those alive locks nobody out of anything.
    expect(refreshTokenRepository.count()).toBe(0);
  });

  it("leaves ANOTHER user's sessions alone", async () => {
    const other = UserEntity.create({
      email: "other@example.com",
      login: "other",
      name: "Other",
      password: "hashed_password",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: new Date(),
      googleId: null,
    });
    await usersRepository.create(other);
    await refreshTokenRepository.create(
      RefreshTokenEntity.create({
        userId: other.id,
        token: "other-session",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * MINUTE_MS),
      }),
    );

    await reset(await mintToken());

    expect(refreshTokenRepository.count()).toBe(1);
    expect(refreshTokenRepository.getAll()[0]?.userId).toBe(other.id);
  });

  it("verifies an unverified address, because opening the link proved the mailbox", async () => {
    const unverified = UserEntity.create({
      email: "never-confirmed@example.com",
      login: "never-confirmed",
      name: "Never Confirmed",
      password: "hashed_old-password",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: null,
      googleId: null,
    });
    await usersRepository.create(unverified);

    await reset(await mintToken({ userId: unverified.id }));

    // Without this the user sets a working password and is STILL refused at
    // login by the verification gate — a dead end with no way out.
    const stored = await usersRepository.findById(unverified.id);
    expect(stored?.emailVerifiedAt).toBeInstanceOf(Date);
    expect(stored?.isEmailVerified()).toBe(true);
  });

  it("refuses a REUSED token", async () => {
    const rawToken = await mintToken();

    await reset(rawToken);

    await expect(reset(rawToken, "another-password")).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );

    // The first reset stands; the replay changed nothing.
    const stored = await usersRepository.findById(user.id);
    expect(stored?.password).toBe(`hashed_${NEW_PASSWORD}`);
  });

  it("refuses an expired token and does not touch the password", async () => {
    const rawToken = await mintToken({
      expiresAt: new Date(Date.now() - MINUTE_MS),
    });

    await expect(reset(rawToken)).rejects.toBeInstanceOf(
      InvalidResetTokenError,
    );

    const stored = await usersRepository.findById(user.id);
    expect(stored?.password).toBe("hashed_old-password");
  });

  it("answers an unknown token identically to an expired one", async () => {
    const expired = await mintToken({
      expiresAt: new Date(Date.now() - MINUTE_MS),
    });

    const unknownError = await reset(tokenProvider.generateOpaqueToken()).catch(
      (error: unknown) => error,
    );
    const expiredError = await reset(expired).catch((error: unknown) => error);

    expect(unknownError).toBeInstanceOf(InvalidResetTokenError);
    expect((unknownError as Error).message).toBe(
      (expiredError as Error).message,
    );
    expect(unknownError).toMatchObject({
      statusCode: 400,
      errorCode: "INVALID_RESET_TOKEN",
    });
  });

  it("resets the token's OWN user, never the caller's guess", async () => {
    const victim = UserEntity.create({
      email: "victim@example.com",
      login: "victim",
      name: "Victim",
      password: "hashed_victim-password",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: new Date(),
      googleId: null,
    });
    await usersRepository.create(victim);

    // A token issued for `user` must only ever be able to change `user`.
    await reset(await mintToken({ userId: user.id }));

    expect((await usersRepository.findById(victim.id))?.password).toBe(
      "hashed_victim-password",
    );
    expect((await usersRepository.findById(user.id))?.password).toBe(
      `hashed_${NEW_PASSWORD}`,
    );
  });

  it("invalidates the user's OTHER outstanding reset links", async () => {
    const first = await mintToken();
    const second = await mintToken();

    await reset(second);

    // No link may survive the password change it authorised.
    await expect(reset(first)).rejects.toBeInstanceOf(InvalidResetTokenError);
    expect(tokenRepository.getAll().every((t) => t.isConsumed())).toBe(true);
  });

  it("refuses a token whose user no longer exists", async () => {
    const orphan = await mintToken({
      userId: "99999999-9999-9999-9999-999999999999",
    });

    await expect(reset(orphan)).rejects.toBeInstanceOf(InvalidResetTokenError);
  });
});
