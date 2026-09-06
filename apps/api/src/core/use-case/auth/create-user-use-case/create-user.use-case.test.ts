import { CreateUserUseCase } from "./create-user.use-case.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ICreateUserUseCaseInput } from "../../types.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { DuplicateResourceError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryEmailVerificationTokenRepository } from "../../../repositories/email-verification-token/in-memory-email-verification-token-repository.js";
import { InMemoryHashProvider } from "../../../providers/hash/in-memory-hash-provider.js";
import { InMemoryTokenProvider } from "../../../providers/token/in-memory-token-provider.js";
import { InMemoryMailProvider } from "../../../providers/mail/in-memory-mail-provider.js";
import { expectDefined } from "../../../../test-support/expect-defined.js";

const mockValidator = vi.fn();

const APP_PUBLIC_URL = "https://app.example.com";
const TOKEN_TTL_HOURS = 24;

describe("CreateUserUseCase", () => {
  let createUserUseCase: CreateUserUseCase;
  let usersRepository: InMemoryUsersRepository;
  let verificationTokenRepository: InMemoryEmailVerificationTokenRepository;
  let hashProvider: InMemoryHashProvider;
  let tokenProvider: InMemoryTokenProvider;
  let mailProvider: InMemoryMailProvider;
  let validInput: ICreateUserUseCaseInput;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    verificationTokenRepository =
      new InMemoryEmailVerificationTokenRepository();
    hashProvider = new InMemoryHashProvider();
    tokenProvider = new InMemoryTokenProvider();
    mailProvider = new InMemoryMailProvider();

    createUserUseCase = new CreateUserUseCase(
      usersRepository,
      verificationTokenRepository,
      hashProvider,
      tokenProvider,
      mailProvider,
      { appPublicUrl: APP_PUBLIC_URL, tokenTtlHours: TOKEN_TTL_HOURS },
      mockValidator,
    );

    validInput = {
      email: "test@example.com",
      login: "testuser",
      name: "Test User",
      password: "password123",
      description: "Test description",
      avatarUrl: "https://example.com/avatar.jpg",
    };

    // Reset all mocks and clear repositories
    vi.clearAllMocks();
    usersRepository.clear();
    verificationTokenRepository.clear();
    mailProvider.clear();
  });

  describe("execute", () => {
    it("should successfully create a user when all data is valid", async () => {
      // Arrange
      const expectedHashedPassword = "hashed_password123";

      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      const result = await createUserUseCase.execute(validInput);

      // Assert
      expect(mockValidator).toHaveBeenCalledWith(validInput);

      // Verify user was created in repository
      const allUsers = usersRepository.getAll();
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0]?.email).toBe(validInput.email);
      expect(allUsers[0]?.login).toBe(validInput.login);
      expect(allUsers[0]?.name).toBe(validInput.name);
      expect(allUsers[0]?.password).toBe(expectedHashedPassword);
      expect(allUsers[0]?.description).toBe(validInput.description);
      expect(allUsers[0]?.avatarUrl).toBe(validInput.avatarUrl);
      expect(allUsers[0]?.googleId).toBeNull();

      // The account starts UNVERIFIED. If this ever comes back non-null the
      // whole verification step is decorative.
      expect(allUsers[0]?.emailVerifiedAt).toBeNull();
      expect(allUsers[0]?.isEmailVerified()).toBe(false);

      // NO SESSION. Registration used to return both tokens; handing one out
      // here would sign in an address nobody has proved.
      expect(result).not.toHaveProperty("accessToken");
      expect(result).not.toHaveProperty("refreshToken");
      expect(result.emailVerificationRequired).toBe(true);

      // Verify returned user matches created user
      expect(result.user).toEqual(allUsers[0]?.toPublic());
    });

    it("emails a verification link whose token is stored only as a hash", async () => {
      vi.mocked(mockValidator).mockReturnValue(validInput);

      const result = await createUserUseCase.execute(validInput);

      expect(result.verificationEmailSent).toBe(true);
      expect(mailProvider.sent).toHaveLength(1);

      const message = mailProvider.lastMessage();
      expect(message?.to).toBe(validInput.email);

      // Dig the raw token back out of the email the way a user's browser would.
      const rawToken = new URL(
        message!.text.split("\n").find((line) => line.startsWith("http"))!,
      ).searchParams.get("token");

      expect(rawToken).toBeTruthy();
      expect(message!.text).toContain(`${APP_PUBLIC_URL}/verify-email?token=`);

      const stored = verificationTokenRepository.getAll();
      expect(stored).toHaveLength(1);
      expect(stored[0]?.userId).toBe(
        expectDefined(usersRepository.getAll()[0], "the created user").id,
      );
      // The database must never hold the value that arrives in the request.
      expect(stored[0]?.tokenHash).not.toBe(rawToken);
      expect(stored[0]?.tokenHash).toBe(tokenProvider.hash(rawToken!));
      expect(stored[0]?.consumedAt).toBeNull();
      expect(stored[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("keeps the account when the mail transport fails", async () => {
      // The regression this guards: an SMTP outage rolling back — or throwing
      // out of — a registration that already committed a row. The user would
      // see an error, the account would exist, and their second attempt would
      // hit "email already taken" with no way forward.
      vi.mocked(mockValidator).mockReturnValue(validInput);
      mailProvider.failNextSend = new Error("smtp: connection refused");

      const result = await createUserUseCase.execute(validInput);

      expect(usersRepository.count()).toBe(1);
      expect(result.emailVerificationRequired).toBe(true);
      expect(result.verificationEmailSent).toBe(false);
      expect(result.verificationEmailError?.message).toBe(
        "smtp: connection refused",
      );
      // The token is still valid, so /auth/resend-verification can reach it.
      expect(verificationTokenRepository.count()).toBe(1);
    });

    it("should throw DuplicateResourceError when email already exists", async () => {
      // Arrange
      const existingUser = UserEntity.create({
        email: validInput.email, // Same email
        login: "differentlogin",
        name: "Existing User",
        password: "hashedpassword",
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(existingUser);

      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act & Assert
      await expect(createUserUseCase.execute(validInput)).rejects.toThrow(
        new DuplicateResourceError("User", "email", validInput.email),
      );

      // Verify no new user was created
      expect(usersRepository.count()).toBe(1);
      // Nothing was minted and no email went out for a rejected signup.
      expect(verificationTokenRepository.count()).toBe(0);
      expect(mailProvider.sent).toHaveLength(0);
    });

    it("should throw DuplicateResourceError when the same mailbox is registered in a different case", async () => {
      // Arrange - the account already on file was typed with capitals
      const existingUser = UserEntity.create({
        email: "Case.Split@Example.com",
        login: "case-split",
        name: "Existing User",
        password: "hashedpassword",
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(existingUser);

      const lowercaseSignup: ICreateUserUseCaseInput = {
        ...validInput,
        email: "case.split@example.com",
        login: "case-split-again",
      };
      vi.mocked(mockValidator).mockReturnValue(lowercaseSignup);

      // Act & Assert - the same mailbox must not become a second account
      await expect(createUserUseCase.execute(lowercaseSignup)).rejects.toThrow(
        new DuplicateResourceError("User", "email", lowercaseSignup.email),
      );

      expect(usersRepository.count()).toBe(1);
      expect(verificationTokenRepository.count()).toBe(0);
    });

    it("should still refuse a third signup when the mailbox is already on file twice in different cases", async () => {
      // Arrange - the pair BUG-20260827-login-multi-row-heap-order is about:
      // two rows one case-insensitive lookup both matches. Picking one of them
      // deterministically must not turn into "found nothing" here.
      for (const email of [
        "Case.Split@Example.com",
        "case.split@example.com",
      ]) {
        await usersRepository.create(
          UserEntity.create({
            email,
            login: `case-split-${email.startsWith("C") ? "upper" : "lower"}`,
            name: "Existing User",
            password: "hashedpassword",
            description: null,
            avatarUrl: null,
            googleId: null,
          }),
        );
      }

      const thirdSignup: ICreateUserUseCaseInput = {
        ...validInput,
        email: "CASE.SPLIT@example.com",
        login: "case-split-third",
      };
      vi.mocked(mockValidator).mockReturnValue(thirdSignup);

      // Act & Assert
      await expect(createUserUseCase.execute(thirdSignup)).rejects.toThrow(
        new DuplicateResourceError("User", "email", thirdSignup.email),
      );

      expect(usersRepository.count()).toBe(2);
      expect(verificationTokenRepository.count()).toBe(0);
    });

    it("should throw DuplicateResourceError when login already exists", async () => {
      // Arrange
      const existingUser = UserEntity.create({
        email: "different@example.com",
        login: validInput.login, // Same login
        name: "Existing User",
        password: "hashedpassword",
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(existingUser);

      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act & Assert
      await expect(createUserUseCase.execute(validInput)).rejects.toThrow(
        new DuplicateResourceError("User", "login", validInput.login),
      );

      // Verify no new user was created
      expect(usersRepository.count()).toBe(1);
      // Nothing was minted and no email went out for a rejected signup.
      expect(verificationTokenRepository.count()).toBe(0);
      expect(mailProvider.sent).toHaveLength(0);
    });

    it("should create user with null optional fields when not provided", async () => {
      // Arrange
      const minimalInput: ICreateUserUseCaseInput = {
        email: "test@example.com",
        login: "testuser",
        name: "Test User",
        password: "password123",
      };

      vi.mocked(mockValidator).mockReturnValue(minimalInput);

      // Act
      const result = await createUserUseCase.execute(minimalInput);

      // Assert
      const allUsers = usersRepository.getAll();
      expect(allUsers).toHaveLength(1);
      expect(allUsers[0]?.email).toBe(minimalInput.email);
      expect(allUsers[0]?.login).toBe(minimalInput.login);
      expect(allUsers[0]?.name).toBe(minimalInput.name);
      expect(allUsers[0]?.password).toBe("hashed_password123");
      expect(allUsers[0]?.description).toBeNull();
      expect(allUsers[0]?.avatarUrl).toBeNull();
      expect(allUsers[0]?.googleId).toBeNull();

      // Verify the verification token was created
      expect(verificationTokenRepository.count()).toBe(1);
      expect(result.emailVerificationRequired).toBe(true);

      expect(result.user).toEqual(allUsers[0]?.toPublic());
    });

    it("should check for both email and login conflicts", async () => {
      // Arrange
      const userWithSameEmail = UserEntity.create({
        email: validInput.email,
        login: "differentlogin1",
        name: "User 1",
        password: "hashedpassword",
        description: null,
        avatarUrl: null,
        googleId: null,
      });

      const userWithSameLogin = UserEntity.create({
        email: "different@example.com",
        login: validInput.login,
        name: "User 2",
        password: "hashedpassword",
        description: null,
        avatarUrl: null,
        googleId: null,
      });

      await usersRepository.create(userWithSameEmail);
      await usersRepository.create(userWithSameLogin);

      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act & Assert - Should fail on email first
      await expect(createUserUseCase.execute(validInput)).rejects.toThrow(
        new DuplicateResourceError("User", "email", validInput.email),
      );

      // Verify no new user was created
      expect(usersRepository.count()).toBe(2);
    });

    it("should hash the password before storing", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      await createUserUseCase.execute(validInput);

      // Assert
      const allUsers = usersRepository.getAll();
      expect(allUsers[0]?.password).toBe("hashed_password123");
      expect(allUsers[0]?.password).not.toBe(validInput.password);
    });
  });
});
