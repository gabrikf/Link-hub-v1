import { CreateUserUseCase } from "./create-user.use-case.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ICreateUserUseCaseInput } from "../../types.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { DuplicateResourceError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryHashProvider } from "../../../providers/hash/in-memory-hash-provider.js";
import { InMemoryJwtProvider } from "../../../providers/jwt/in-memory-jwt-provider.js";

const mockValidator = vi.fn();

describe("CreateUserUseCase", () => {
  let createUserUseCase: CreateUserUseCase;
  let usersRepository: InMemoryUsersRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let hashProvider: InMemoryHashProvider;
  let jwtProvider: InMemoryJwtProvider;
  let validInput: ICreateUserUseCaseInput;

  beforeEach(() => {
    usersRepository = new InMemoryUsersRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    hashProvider = new InMemoryHashProvider();
    jwtProvider = new InMemoryJwtProvider();

    createUserUseCase = new CreateUserUseCase(
      usersRepository,
      refreshTokenRepository,
      hashProvider,
      jwtProvider,
      mockValidator
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
    refreshTokenRepository.clear();
    jwtProvider.reset();
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
      expect(allUsers[0].email).toBe(validInput.email);
      expect(allUsers[0].login).toBe(validInput.login);
      expect(allUsers[0].name).toBe(validInput.name);
      expect(allUsers[0].password).toBe(expectedHashedPassword);
      expect(allUsers[0].description).toBe(validInput.description);
      expect(allUsers[0].avatarUrl).toBe(validInput.avatarUrl);
      expect(allUsers[0].googleId).toBeNull();

      // Verify access token was generated correctly
      expect(result.accessToken).toMatch(/^test_token_1_/);
      expect(result.accessToken).toContain(allUsers[0].id);

      // Verify refresh token was created
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe("string");

      const allRefreshTokens = refreshTokenRepository.getAll();
      expect(allRefreshTokens).toHaveLength(1);
      expect(allRefreshTokens[0].userId).toBe(allUsers[0].id);
      expect(allRefreshTokens[0].token).toBe(result.refreshToken);
      expect(allRefreshTokens[0].isValid()).toBe(true);

      // Verify returned user matches created user
      expect(result.user).toEqual(allUsers[0].toPublic());
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
        new DuplicateResourceError("User", "email", validInput.email)
      );

      // Verify no new user was created
      expect(usersRepository.count()).toBe(1);
      // Verify no refresh token was created
      expect(refreshTokenRepository.count()).toBe(0);
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
        new DuplicateResourceError("User", "email", lowercaseSignup.email)
      );

      expect(usersRepository.count()).toBe(1);
      expect(refreshTokenRepository.count()).toBe(0);
    });

    it("should still refuse a third signup when the mailbox is already on file twice in different cases", async () => {
      // Arrange - the pair BUG-20260827-login-multi-row-heap-order is about:
      // two rows one case-insensitive lookup both matches. Picking one of them
      // deterministically must not turn into "found nothing" here.
      for (const email of ["Case.Split@Example.com", "case.split@example.com"]) {
        await usersRepository.create(
          UserEntity.create({
            email,
            login: `case-split-${email.startsWith("C") ? "upper" : "lower"}`,
            name: "Existing User",
            password: "hashedpassword",
            description: null,
            avatarUrl: null,
            googleId: null,
          })
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
        new DuplicateResourceError("User", "email", thirdSignup.email)
      );

      expect(usersRepository.count()).toBe(2);
      expect(refreshTokenRepository.count()).toBe(0);
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
        new DuplicateResourceError("User", "login", validInput.login)
      );

      // Verify no new user was created
      expect(usersRepository.count()).toBe(1);
      // Verify no refresh token was created
      expect(refreshTokenRepository.count()).toBe(0);
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
      expect(allUsers[0].email).toBe(minimalInput.email);
      expect(allUsers[0].login).toBe(minimalInput.login);
      expect(allUsers[0].name).toBe(minimalInput.name);
      expect(allUsers[0].password).toBe("hashed_password123");
      expect(allUsers[0].description).toBeNull();
      expect(allUsers[0].avatarUrl).toBeNull();
      expect(allUsers[0].googleId).toBeNull();

      // Verify refresh token was created
      expect(result.refreshToken).toBeDefined();
      const allRefreshTokens = refreshTokenRepository.getAll();
      expect(allRefreshTokens).toHaveLength(1);

      expect(result.user).toEqual(allUsers[0].toPublic());
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
        new DuplicateResourceError("User", "email", validInput.email)
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
      expect(allUsers[0].password).toBe("hashed_password123");
      expect(allUsers[0].password).not.toBe(validInput.password);
    });
  });
});
