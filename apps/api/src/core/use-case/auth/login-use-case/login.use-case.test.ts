import { LoginUseCase } from "./login.use-case.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ILoginUseCaseInput } from "../../types.js";
import { UserEntity } from "../../../entity/user/user-entity.js";
import { InvalidCredentialsError } from "../../../errors/index.js";
import { InMemoryUsersRepository } from "../../../repositories/user/in-memory-users-repository.js";
import { InMemoryRefreshTokenRepository } from "../../../repositories/refresh-token/in-memory-refresh-token-repository.js";
import { InMemoryHashProvider } from "../../../providers/hash/in-memory-hash-provider.js";
import { InMemoryJwtProvider } from "../../../providers/jwt/in-memory-jwt-provider.js";

const mockValidator = vi.fn();

describe("LoginUseCase", () => {
  let loginUseCase: LoginUseCase;
  let usersRepository: InMemoryUsersRepository;
  let refreshTokenRepository: InMemoryRefreshTokenRepository;
  let hashProvider: InMemoryHashProvider;
  let jwtProvider: InMemoryJwtProvider;
  let validInput: ILoginUseCaseInput;
  let testUser: UserEntity;

  beforeEach(async () => {
    usersRepository = new InMemoryUsersRepository();
    refreshTokenRepository = new InMemoryRefreshTokenRepository();
    hashProvider = new InMemoryHashProvider();
    jwtProvider = new InMemoryJwtProvider();

    loginUseCase = new LoginUseCase(
      usersRepository,
      refreshTokenRepository,
      hashProvider,
      jwtProvider,
      mockValidator
    );

    validInput = {
      email: "test@example.com",
      password: "password123",
    };

    // Create a test user with hashed password
    testUser = UserEntity.create({
      email: "test@example.com",
      login: "testuser",
      name: "Test User",
      password: "hashed_password123", // This is what the hash provider returns
      description: null,
      avatarUrl: null,
      googleId: null,
    });
    await usersRepository.create(testUser);

    // Reset all mocks and clear refresh token repository
    vi.clearAllMocks();
    refreshTokenRepository.clear();
    jwtProvider.reset();
  });

  describe("execute", () => {
    it("should successfully login a user with valid credentials", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      const result = await loginUseCase.execute(validInput);

      // Assert
      expect(mockValidator).toHaveBeenCalledWith(validInput);

      // Verify access token was generated
      expect(result.accessToken).toMatch(/^test_token_1_/);
      expect(result.accessToken).toContain(testUser.id);

      // Verify refresh token was created
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe("string");

      const allRefreshTokens = refreshTokenRepository.getAll();
      expect(allRefreshTokens).toHaveLength(1);
      expect(allRefreshTokens[0].userId).toBe(testUser.id);
      expect(allRefreshTokens[0].token).toBe(result.refreshToken);
      expect(allRefreshTokens[0].isValid()).toBe(true);

      // Verify returned user matches
      expect(result.user).toEqual(testUser.toPublic());
    });

    it("should throw InvalidCredentialsError when user does not exist", async () => {
      // Arrange
      const invalidInput = {
        email: "nonexistent@example.com",
        password: "password123",
      };
      vi.mocked(mockValidator).mockReturnValue(invalidInput);

      // Act & Assert
      await expect(loginUseCase.execute(invalidInput)).rejects.toThrow(
        InvalidCredentialsError
      );

      // Verify no refresh token was created
      expect(refreshTokenRepository.count()).toBe(0);
    });

    it("should throw InvalidCredentialsError when password is incorrect", async () => {
      // Arrange
      const invalidInput = {
        email: "test@example.com",
        password: "wrongpassword",
      };
      vi.mocked(mockValidator).mockReturnValue(invalidInput);

      // Act & Assert
      await expect(loginUseCase.execute(invalidInput)).rejects.toThrow(
        InvalidCredentialsError
      );

      // Verify no refresh token was created
      expect(refreshTokenRepository.count()).toBe(0);
    });

    it("should find user by email", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      const result = await loginUseCase.execute(validInput);

      // Assert
      expect(result.user.email).toBe(testUser.email);
      expect(result.user.id).toBe(testUser.id);
    });

    it("should generate both access token and refresh token", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      const result = await loginUseCase.execute(validInput);

      // Assert
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.accessToken).not.toBe(result.refreshToken);
    });

    it("should store refresh token in database", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      const result = await loginUseCase.execute(validInput);

      // Assert
      const refreshTokens = await refreshTokenRepository.findByUserId(
        testUser.id
      );
      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].token).toBe(result.refreshToken);
      expect(refreshTokens[0].userId).toBe(testUser.id);
    });

    it("should set refresh token expiration to 7 days", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);
      const beforeLogin = new Date();

      // Act
      await loginUseCase.execute(validInput);

      // Assert
      const refreshTokens = refreshTokenRepository.getAll();
      expect(refreshTokens).toHaveLength(1);

      const expiresAt = refreshTokens[0].expiresAt;
      const sevenDaysFromNow = new Date(beforeLogin);
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      // Check that expiration is approximately 7 days (within 1 second tolerance)
      const timeDiff = Math.abs(
        expiresAt.getTime() - sevenDaysFromNow.getTime()
      );
      expect(timeDiff).toBeLessThan(1000); // Less than 1 second difference
    });

    it("should sign in a stored capitalised address typed back in lowercase", async () => {
      // Arrange - the phone keyboard capitalised the address at signup, so the
      // row holds capitals the person will never reproduce by hand.
      const capitalisedUser = UserEntity.create({
        email: "Case.Split@Example.com",
        login: "case-split",
        name: "Case Split",
        password: "hashed_password123",
        description: null,
        avatarUrl: null,
        googleId: null,
      });
      await usersRepository.create(capitalisedUser);

      const lowercaseInput: ILoginUseCaseInput = {
        email: "case.split@example.com",
        password: "password123",
      };
      vi.mocked(mockValidator).mockReturnValue(lowercaseInput);

      // Act
      const result = await loginUseCase.execute(lowercaseInput);

      // Assert - one mailbox, one account, whatever the case
      expect(result.user.id).toBe(capitalisedUser.id);
      expect(result.accessToken).toBeTypeOf("string");
    });

    // BUG-20260827-login-multi-row-heap-order: one mailbox can already exist
    // twice in different cases (a pair of rows the case-insensitive lookup both
    // matches). The lookup used to answer with whichever row the database
    // happened to return first, so one of the two owners typed their own
    // address and their own password and was refused, forever.
    describe("when one mailbox is stored twice in different cases", () => {
      let capitalisedOwner: UserEntity;
      let lowercaseOwner: UserEntity;

      async function seedCollidingPair(order: "capitalised-first" | "lowercase-first") {
        capitalisedOwner = UserEntity.create({
          email: "Dup.Owner@Example.com",
          login: "dup-owner-capitalised",
          name: "Capitalised Owner",
          password: "hashed_capitalised-secret",
          description: null,
          avatarUrl: null,
          googleId: null,
        });
        lowercaseOwner = UserEntity.create({
          email: "dup.owner@example.com",
          login: "dup-owner-lowercase",
          name: "Lowercase Owner",
          password: "hashed_lowercase-secret",
          description: null,
          avatarUrl: null,
          googleId: null,
        });

        const pair =
          order === "capitalised-first"
            ? [capitalisedOwner, lowercaseOwner]
            : [lowercaseOwner, capitalisedOwner];

        for (const user of pair) {
          await usersRepository.create(user);
        }
      }

      it.each(["capitalised-first", "lowercase-first"] as const)(
        "signs each owner into their own account, whatever order the rows were stored in (%s)",
        async (order) => {
          // Arrange
          await seedCollidingPair(order);

          // Act - the capitalised owner types their address exactly as stored
          const capitalisedInput: ILoginUseCaseInput = {
            email: "Dup.Owner@Example.com",
            password: "capitalised-secret",
          };
          vi.mocked(mockValidator).mockReturnValue(capitalisedInput);
          const capitalisedResult =
            await loginUseCase.execute(capitalisedInput);

          // Act - and so does the lowercase owner
          const lowercaseInput: ILoginUseCaseInput = {
            email: "dup.owner@example.com",
            password: "lowercase-secret",
          };
          vi.mocked(mockValidator).mockReturnValue(lowercaseInput);
          const lowercaseResult = await loginUseCase.execute(lowercaseInput);

          // Assert - each one lands in their own account, not the other's
          expect(capitalisedResult.user.id).toBe(capitalisedOwner.id);
          expect(capitalisedResult.user.email).toBe("Dup.Owner@Example.com");
          expect(lowercaseResult.user.id).toBe(lowercaseOwner.id);
          expect(lowercaseResult.user.email).toBe("dup.owner@example.com");
        }
      );

      it("does not let one owner's password open the other owner's address", async () => {
        // Arrange
        await seedCollidingPair("capitalised-first");

        const crossedInput: ILoginUseCaseInput = {
          email: "dup.owner@example.com",
          password: "capitalised-secret",
        };
        vi.mocked(mockValidator).mockReturnValue(crossedInput);

        // Act & Assert
        await expect(loginUseCase.execute(crossedInput)).rejects.toThrow(
          InvalidCredentialsError
        );
        expect(refreshTokenRepository.count()).toBe(0);
      });
    });

    it("should not expose password in returned user", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act
      const result = await loginUseCase.execute(validInput);

      // Assert
      expect(result.user).not.toHaveProperty("password");
      expect(result.user).toHaveProperty("email");
      expect(result.user).toHaveProperty("id");
      expect(result.user).toHaveProperty("login");
      expect(result.user).toHaveProperty("name");
    });

    it("should allow multiple logins for the same user", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Act - Login twice
      const result1 = await loginUseCase.execute(validInput);
      jwtProvider.reset(); // Reset counter for different token
      const result2 = await loginUseCase.execute(validInput);

      // Assert - Both should succeed with different tokens
      expect(result1.refreshToken).not.toBe(result2.refreshToken);
      expect(refreshTokenRepository.count()).toBe(2);

      const userTokens = await refreshTokenRepository.findByUserId(testUser.id);
      expect(userTokens).toHaveLength(2);
    });
  });
});
