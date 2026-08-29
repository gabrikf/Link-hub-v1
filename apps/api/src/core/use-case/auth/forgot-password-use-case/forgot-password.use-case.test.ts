import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordUseCase } from "./forgot-password.use-case.js";
import { PasswordResetTokenEntity } from "../../../entity/password-reset-token/password-reset-token-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryPasswordResetTokenRepository } from "../../../repositories/password-reset-token/in-memory-password-reset-token-repository.js";
import { InMemoryTokenProvider } from "../../../providers/token/in-memory-token-provider.js";
import { InMemoryMailProvider } from "../../../providers/mail/in-memory-mail-provider.js";
import { AUTH_EMAIL_COOLDOWN_MS } from "../auth-email-cooldown.js";

const EMAIL = "forgetful@example.com";
const APP_PUBLIC_URL = "https://app.example.com";
const TTL_MINUTES = 20;

describe("ForgotPasswordUseCase", () => {
  const validator = vi.fn();

  let useCase: ForgotPasswordUseCase;
  let usersRepository: InMemoryUsersRepository;
  let tokenRepository: InMemoryPasswordResetTokenRepository;
  let tokenProvider: InMemoryTokenProvider;
  let mailProvider: InMemoryMailProvider;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    tokenRepository = new InMemoryPasswordResetTokenRepository();
    tokenProvider = new InMemoryTokenProvider();
    mailProvider = new InMemoryMailProvider();

    useCase = new ForgotPasswordUseCase(
      usersRepository,
      tokenRepository,
      tokenProvider,
      mailProvider,
      { appPublicUrl: APP_PUBLIC_URL, tokenTtlMinutes: TTL_MINUTES },
      validator,
    );

    vi.clearAllMocks();
    vi.mocked(validator).mockImplementation((input: unknown) => input as never);
  });

  async function seedUser(overrides?: {
    emailVerifiedAt?: Date | null;
    googleId?: string | null;
  }): Promise<UserEntity> {
    const user = UserEntity.create({
      email: EMAIL,
      login: "forgetful",
      name: "Forgetful User",
      password: "hashed_old-password",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: overrides?.emailVerifiedAt ?? new Date(),
      googleId: overrides?.googleId ?? null,
    });
    await usersRepository.create(user);
    return user;
  }

  it("emails a link and stores only its hash", async () => {
    const user = await seedUser();

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("sent");
    expect(mailProvider.sent).toHaveLength(1);

    const message = mailProvider.lastMessage();
    expect(message?.to).toBe(EMAIL);
    expect(message?.subject).toBe("Reset your CraftHub password");
    // The expiry is stated in the body: a 20-minute link WILL be opened late,
    // and "expires in 20 minutes" is the difference between "broken site" and
    // "ask for another".
    expect(message?.text).toContain("expires in 20 minutes");
    expect(message?.text).toContain("you can ignore this email");

    const link = message!.text
      .split("\n")
      .find((line) => line.startsWith(APP_PUBLIC_URL));
    expect(link).toContain(`${APP_PUBLIC_URL}/reset-password?token=`);

    const rawToken = new URL(link!).searchParams.get("token")!;
    const stored = tokenRepository.getAll();
    expect(stored).toHaveLength(1);
    expect(stored[0].userId).toBe(user.id);
    // A stored reset token that could be presented would be worse than a
    // stolen password hash — it needs no cracking at all.
    expect(stored[0].tokenHash).not.toBe(rawToken);
    expect(stored[0].tokenHash).toBe(tokenProvider.hash(rawToken));

    // 20 minutes, not 24 hours.
    const lifetimeMs = stored[0].expiresAt.getTime() - Date.now();
    expect(lifetimeMs).toBeLessThanOrEqual(TTL_MINUTES * 60 * 1000);
    expect(lifetimeMs).toBeGreaterThan(TTL_MINUTES * 60 * 1000 - 5000);
  });

  it("mails nobody for an address with no account", async () => {
    const result = await useCase.execute({ email: "stranger@example.com" });

    expect(result.outcome).toBe("no-such-account");
    expect(mailProvider.sent).toHaveLength(0);
    expect(tokenRepository.count()).toBe(0);
  });

  it("does the same token work for a missing account, so there is no timing tell", async () => {
    const generateSpy = vi.spyOn(tokenProvider, "generateOpaqueToken");
    const hashSpy = vi.spyOn(tokenProvider, "hash");

    await useCase.execute({ email: "stranger@example.com" });

    // The bodies already match; an early return would leave a stopwatch-shaped
    // oracle in place of the one the response no longer gives away.
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });

  it("serves an OAuth-only account, because the token still proves the mailbox", async () => {
    // Deliberate: an account created through Google has a random password hash
    // nobody knows, and this is the "add a password to my social login" flow.
    // Refusing would strand anyone who loses their Google account, and it would
    // have to show in the response to be useful — reintroducing the oracle.
    await seedUser({ googleId: "google-123" });

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("sent");
    expect(mailProvider.sent).toHaveLength(1);
  });

  it("invalidates outstanding links when issuing a new one", async () => {
    const user = await seedUser();

    const stale = PasswordResetTokenEntity.create({
      userId: user.id,
      tokenHash: tokenProvider.hash("older-token"),
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
      consumedAt: null,
    });
    stale.createdAt = new Date(Date.now() - AUTH_EMAIL_COOLDOWN_MS - 1000);
    await tokenRepository.create(stale);

    await useCase.execute({ email: EMAIL });

    // Someone who pressed "forgot password" twice must not be left holding two
    // live keys to their own account.
    const older = await tokenRepository.findByTokenHash(
      tokenProvider.hash("older-token"),
    );
    expect(older?.isConsumed()).toBe(true);
    expect(tokenRepository.count()).toBe(2);
  });

  it("refuses to mail-bomb: a second request inside the cooldown sends nothing", async () => {
    await seedUser();

    await useCase.execute({ email: EMAIL });
    const second = await useCase.execute({ email: EMAIL });

    expect(second.outcome).toBe("cooling-down");
    expect(mailProvider.sent).toHaveLength(1);
    expect(tokenRepository.count()).toBe(1);
  });

  it("sends again once the cooldown has passed", async () => {
    const user = await seedUser();

    const stale = PasswordResetTokenEntity.create({
      userId: user.id,
      tokenHash: tokenProvider.hash("older-token"),
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000),
      consumedAt: null,
    });
    stale.createdAt = new Date(Date.now() - AUTH_EMAIL_COOLDOWN_MS - 1000);
    await tokenRepository.create(stale);

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("sent");
    expect(mailProvider.sent).toHaveLength(1);
  });

  it("surfaces a mail transport failure instead of claiming success", async () => {
    await seedUser();
    mailProvider.failNextSend = new Error("smtp: connection refused");

    // The send IS the request. A cheerful "sent" over a dead transport costs
    // the user their only route back into the account.
    await expect(useCase.execute({ email: EMAIL })).rejects.toThrow(
      "smtp: connection refused",
    );
  });
});
