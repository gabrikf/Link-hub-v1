import { UserEntity } from "../domain/entity/user/user-entity.js";
import { IUsersRepository } from "../domain/repositorries/user-repository.js";
import { IHashProvider } from "../providers/hash-provider.js";
import { IJwtProvider } from "../providers/jwt-provider.js";
import { DuplicateResourceError } from "../errors/index.js";
import { ICreateUserUseCaseInput } from "./types.js";

export class CreateUserUseCase {
  constructor(
    private usersRepository: IUsersRepository,
    private hashProvider: IHashProvider,
    private jwtProvider: IJwtProvider,
    private validator: (input: unknown) => ICreateUserUseCaseInput
  ) {}

  // This is where the core logic happens
  async execute(input: ICreateUserUseCaseInput) {
    // 1. Validate input (already handled by Zod in the controller, but good practice)
    const data = this.validator(input);

    // 2. Check if user already exists (parallel execution)
    const [userWithSameEmail, userWithSameLogin] = await Promise.all([
      this.usersRepository.findByEmailOrLogin(data.email),
      this.usersRepository.findByEmailOrLogin(data.login),
    ]);

    if (userWithSameEmail) {
      throw new DuplicateResourceError("User", "email", data.email);
    }

    if (userWithSameLogin) {
      throw new DuplicateResourceError("User", "login", data.login);
    }

    // 3. Hash the password
    const passwordHash = await this.hashProvider.hash(data.password);

    // 4. Create a new user entity
    const user = new UserEntity({
      email: data.email,
      login: data.login,
      name: data.name,
      password: passwordHash,
      description: data.description ?? null,
      avatarUrl: data.avatarUrl ?? null,
      googleId: null,
    });

    // 5. Save the user to the database
    const createdUser = await this.usersRepository.create(user);

    // 6. Generate a JWT token
    const token = await this.jwtProvider.sign({ sub: createdUser.id });

    // 7. Return the user and the token
    return {
      user: createdUser,
      token,
    };
  }
}
