import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESEND_VERIFICATION_COOLDOWN_MS,
  ResendVerificationUseCase,
} from "./resend-verification.use-case.js";
import { EmailVerificationTokenEntity } from "../../../entity/email-verification-token/email-verification-token-entity.js";
import { OAuthAccountEntity } from "../../../entity/oauth-account/oauth-account-entity.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryEmailVerificationTokenRepository } from "../../../repositories/email-verification-token/in-memory-email-verification-token-repository.js";
import { InMemoryOAuthAccountRepository } from "../../../repositories/oauth-account/in-memory-oauth-account-repository.js";
import { InMemoryTokenProvider } from "../../../providers/token/in-memory-token-provider.js";
import { InMemoryMailProvider } from "../../../providers/mail/in-memory-mail-provider.js";

const EMAIL = "unverified@example.com";

describe("ResendVerificationUseCase", () => {
  const validator = vi.fn();

  let useCase: ResendVerificationUseCase;
  let usersRepository: InMemoryUsersRepository;
  let tokenRepository: InMemoryEmailVerificationTokenRepository;
  let oauthAccountRepository: InMemoryOAuthAccountRepository;
  let tokenProvider: InMemoryTokenProvider;
  let mailProvider: InMemoryMailProvider;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    tokenRepository = new InMemoryEmailVerificationTokenRepository();
    oauthAccountRepository = new InMemoryOAuthAccountRepository();
    tokenProvider = new InMemoryTokenProvider();
    mailProvider = new InMemoryMailProvider();

    useCase = new ResendVerificationUseCase(
      usersRepository,
      tokenRepository,
      oauthAccountRepository,
      tokenProvider,
      mailProvider,
      { appPublicUrl: "https://app.example.com", tokenTtlHours: 24 },
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
      login: "unverified",
      name: "Unverified User",
      password: "hashed_password123",
      description: null,
      avatarUrl: null,
      emailVerifiedAt: overrides?.emailVerifiedAt ?? null,
      googleId: overrides?.googleId ?? null,
    });
    await usersRepository.create(user);
    return user;
  }

  it("mints a new token and sends it to an unverified account", async () => {
    const user = await seedUser();

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("sent");
    expect(mailProvider.sent).toHaveLength(1);
    expect(mailProvider.lastMessage()?.to).toBe(EMAIL);
    expect(tokenRepository.count()).toBe(1);
    expect(tokenRepository.getAll()[0]?.userId).toBe(user.id);
  });

  it("says nothing about an address that has no account", async () => {
    // The use case reports the outcome to its CALLER for testability; the
    // controller answers 200 { status: "sent" } for every branch here, which is
    // what stops the endpoint being an account-existence oracle.
    const result = await useCase.execute({ email: "nobody@example.com" });

    expect(result.outcome).toBe("no-such-account");
    expect(mailProvider.sent).toHaveLength(0);
    expect(tokenRepository.count()).toBe(0);
  });

  it("does not email an already-verified account", async () => {
    await seedUser({ emailVerifiedAt: new Date() });

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("already-verified");
    expect(mailProvider.sent).toHaveLength(0);
  });

  it("does not email an account that proved its address through a provider", async () => {
    const user = await seedUser({ emailVerifiedAt: null });
    await oauthAccountRepository.create(
      OAuthAccountEntity.create({
        userId: user.id,
        provider: "linkedin",
        providerAccountId: "linkedin-1",
      }),
    );

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("already-verified");
    expect(mailProvider.sent).toHaveLength(0);
  });

  it("refuses to mail-bomb: a second request inside the cooldown sends nothing", async () => {
    await seedUser();

    await useCase.execute({ email: EMAIL });
    const second = await useCase.execute({ email: EMAIL });

    // Without this, anyone could point the endpoint at a victim's address in a
    // loop and have CraftHub deliver the flood on their behalf.
    expect(second.outcome).toBe("cooling-down");
    expect(mailProvider.sent).toHaveLength(1);
    expect(tokenRepository.count()).toBe(1);
  });

  it("sends again once the cooldown has passed", async () => {
    const user = await seedUser();

    const stale = EmailVerificationTokenEntity.create({
      userId: user.id,
      tokenHash: tokenProvider.hash(tokenProvider.generateOpaqueToken()),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      consumedAt: null,
    });
    stale.createdAt = new Date(
      Date.now() - RESEND_VERIFICATION_COOLDOWN_MS - 1000,
    );
    await tokenRepository.create(stale);

    const result = await useCase.execute({ email: EMAIL });

    expect(result.outcome).toBe("sent");
    expect(mailProvider.sent).toHaveLength(1);
    expect(tokenRepository.count()).toBe(2);
  });

  it("surfaces a mail transport failure instead of claiming success", async () => {
    await seedUser();
    mailProvider.failNextSend = new Error("smtp: connection refused");

    // Unlike registration, the send IS the request here. Swallowing the error
    // would tell a user their email is on the way when it never left.
    await expect(useCase.execute({ email: EMAIL })).rejects.toThrow(
      "smtp: connection refused",
    );
  });

  it("does the same token work for a missing account, so there is no timing tell", async () => {
    const generateSpy = vi.spyOn(tokenProvider, "generateOpaqueToken");
    const hashSpy = vi.spyOn(tokenProvider, "hash");

    await useCase.execute({ email: "nobody@example.com" });

    // The bodies already match; an early return would leave a stopwatch-shaped
    // oracle in place of the one the response no longer gives away.
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });
});
