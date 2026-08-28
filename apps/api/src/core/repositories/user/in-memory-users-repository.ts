import { UserEntity } from "../../entity/user/user-entity.js";
import { normalizeEmail } from "../../entity/user/normalize-email.js";
import { selectMatchingAccount } from "../../entity/user/select-matching-account.js";
import { IUsersRepository } from "./user-repository.js";

export class InMemoryUsersRepository implements IUsersRepository {
  private users: UserEntity[] = [];

  async findByEmailOrLogin(emailOrLogin: string): Promise<UserEntity | null> {
    const normalized = normalizeEmail(emailOrLogin);
    const matches = this.users.filter(
      (user) =>
        normalizeEmail(user.email) === normalized ||
        user.login === emailOrLogin,
    );
    return selectMatchingAccount(matches, emailOrLogin);
  }

  async create(user: UserEntity): Promise<UserEntity> {
    this.users.push(user);
    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = normalizeEmail(email);
    const matches = this.users.filter(
      (candidate) => normalizeEmail(candidate.email) === normalized,
    );
    return selectMatchingAccount(matches, email);
  }

  async findByLogin(login: string): Promise<UserEntity | null> {
    const user = this.users.find((candidate) => candidate.login === login);
    return user || null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = this.users.find((candidate) => candidate.id === id);
    return user || null;
  }

  async findByGoogleId(googleId: string): Promise<UserEntity | null> {
    const user = this.users.find(
      (candidate) => candidate.googleId === googleId,
    );
    return user || null;
  }

  async update(user: UserEntity): Promise<UserEntity> {
    const index = this.users.findIndex((candidate) => candidate.id === user.id);

    if (index === -1) {
      throw new Error(`User with id '${user.id}' not found`);
    }

    this.users[index] = user;
    return user;
  }

  // Helper methods for testing
  clear(): void {
    this.users = [];
  }

  getAll(): UserEntity[] {
    return [...this.users];
  }

  count(): number {
    return this.users.length;
  }
}
