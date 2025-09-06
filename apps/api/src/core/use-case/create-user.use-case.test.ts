import { IUsersRepository } from "../domain/repositorries/user-repository.js";
import { IHashProvider } from "../providers/hash-provider.js";
import { IJwtProvider } from "../providers/jwt-provider.js";
import { CreateUserUseCase } from "./create-user.use-case.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ICreateUserUseCaseInput } from "./types.js";
import { UserEntity } from "../domain/entity/user/user-entity.js";
import { DuplicateResourceError } from "../errors/index.js";

// Mock implementations
const mockUsersRepository = {
  findByEmailOrLogin: vi.fn(),
  create: vi.fn(),
} as IUsersRepository;

const mockHashProvider = {
  hash: vi.fn(),
} as IHashProvider;

const mockJwtProvider = {
  sign: vi.fn(),
  verify: vi.fn(),
} as IJwtProvider;

const mockValidator = vi.fn();

describe("CreateUserUseCase", () => {
  let createUserUseCase: CreateUserUseCase;
  let validInput: ICreateUserUseCaseInput;

  beforeEach(() => {
    createUserUseCase = new CreateUserUseCase(
      mockUsersRepository,
      mockHashProvider,
      mockJwtProvider,
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

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("execute", () => {
    it("should successfully create a user when all data is valid", async () => {
      // Arrange
      const hashedPassword = "hashed_password_123";
      const mockUser = new UserEntity({
        email: validInput.email,
        login: validInput.login,
        name: validInput.name,
        password: hashedPassword,
        description: validInput.description,
        avatarUrl: validInput.avatarUrl,
        googleId: null,
      });
      const mockToken = "jwt_token_123";

      vi.mocked(mockValidator).mockReturnValue(validInput);
      vi.mocked(mockUsersRepository.findByEmailOrLogin)
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(null); // login check
      vi.mocked(mockHashProvider.hash).mockResolvedValue(hashedPassword);
      vi.mocked(mockUsersRepository.create).mockResolvedValue(mockUser);
      vi.mocked(mockJwtProvider.sign).mockResolvedValue(mockToken);

      // Act
      const result = await createUserUseCase.execute(validInput);

      // Assert
      expect(mockValidator).toHaveBeenCalledWith(validInput);
      expect(mockUsersRepository.findByEmailOrLogin).toHaveBeenCalledTimes(2);
      expect(mockUsersRepository.findByEmailOrLogin).toHaveBeenCalledWith(
        validInput.email
      );
      expect(mockUsersRepository.findByEmailOrLogin).toHaveBeenCalledWith(
        validInput.login
      );
      expect(mockHashProvider.hash).toHaveBeenCalledWith(validInput.password);
      expect(mockUsersRepository.create).toHaveBeenCalledWith(
        expect.any(UserEntity)
      );
      expect(mockJwtProvider.sign).toHaveBeenCalledWith({ sub: mockUser.id });
      expect(result).toEqual({
        user: mockUser,
        token: mockToken,
      });
    });

    it("should throw DuplicateResourceError when email already exists", async () => {
      // Arrange
      const existingUser = new UserEntity({
        email: "existing@example.com",
        login: "existinguser",
        name: "Existing User",
        password: "hashedpassword",
      });

      vi.mocked(mockValidator).mockReturnValue(validInput);
      vi.mocked(mockUsersRepository.findByEmailOrLogin)
        .mockResolvedValueOnce(existingUser) // email check returns existing user
        .mockResolvedValueOnce(null); // login check

      // Act & Assert
      await expect(createUserUseCase.execute(validInput)).rejects.toThrow(
        new DuplicateResourceError("User", "email", validInput.email)
      );

      expect(mockUsersRepository.findByEmailOrLogin).toHaveBeenCalledTimes(2);
      expect(mockHashProvider.hash).not.toHaveBeenCalled();
      expect(mockUsersRepository.create).not.toHaveBeenCalled();
    });

    it("should throw DuplicateResourceError when login already exists", async () => {
      // Arrange
      const existingUser = new UserEntity({
        email: "existing@example.com",
        login: "existinguser",
        name: "Existing User",
        password: "hashedpassword",
      });

      vi.mocked(mockValidator).mockReturnValue(validInput);
      vi.mocked(mockUsersRepository.findByEmailOrLogin)
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(existingUser); // login check returns existing user

      // Act & Assert
      await expect(createUserUseCase.execute(validInput)).rejects.toThrow(
        new DuplicateResourceError("User", "login", validInput.login)
      );

      expect(mockUsersRepository.findByEmailOrLogin).toHaveBeenCalledTimes(2);
      expect(mockHashProvider.hash).not.toHaveBeenCalled();
      expect(mockUsersRepository.create).not.toHaveBeenCalled();
    });

    it("should create user with null optional fields when not provided", async () => {
      // Arrange
      const minimalInput: ICreateUserUseCaseInput = {
        email: "test@example.com",
        login: "testuser",
        name: "Test User",
        password: "password123",
      };
      const hashedPassword = "hashed_password_123";
      const mockToken = "jwt_token_123";

      vi.mocked(mockValidator).mockReturnValue(minimalInput);
      vi.mocked(mockUsersRepository.findByEmailOrLogin)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      vi.mocked(mockHashProvider.hash).mockResolvedValue(hashedPassword);
      vi.mocked(mockUsersRepository.create).mockResolvedValue(
        expect.any(UserEntity)
      );
      vi.mocked(mockJwtProvider.sign).mockResolvedValue(mockToken);

      // Act
      await createUserUseCase.execute(minimalInput);

      // Assert
      expect(mockUsersRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: minimalInput.email,
          login: minimalInput.login,
          name: minimalInput.name,
          password: hashedPassword,
          description: null,
          avatarUrl: null,
          googleId: null,
        })
      );
    });

    it("should execute email and login checks in parallel (Promise.all)", async () => {
      // Arrange
      vi.mocked(mockValidator).mockReturnValue(validInput);

      // Mock implementations that track call order
      let callOrder: string[] = [];
      vi.mocked(mockUsersRepository.findByEmailOrLogin).mockImplementation(
        async (emailOrLogin: string) => {
          callOrder.push(emailOrLogin);
          // Simulate some async work
          await new Promise((resolve) => setTimeout(resolve, 10));
          return null;
        }
      );

      vi.mocked(mockHashProvider.hash).mockResolvedValue("hashed_password");
      vi.mocked(mockUsersRepository.create).mockResolvedValue(
        expect.any(UserEntity)
      );
      vi.mocked(mockJwtProvider.sign).mockResolvedValue("token");

      // Act
      await createUserUseCase.execute(validInput);

      // Assert - Both calls should have been initiated before either completed
      expect(callOrder).toEqual([validInput.email, validInput.login]);
      expect(mockUsersRepository.findByEmailOrLogin).toHaveBeenCalledTimes(2);
    });
  });
});
