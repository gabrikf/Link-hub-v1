import { UserEntity } from "../../entity/user/user-entity.js";
import { IUsersRepository } from "./user-repository.js";

export class InMemoryUsersRepository implements IUsersRepository {
  private users: UserEntity[] = [];

  async findByEmailOrLogin(emailOrLogin: string): Promise<UserEntity | null> {
    const user = this.users.find(
      (user) => user.email === emailOrLogin || user.login === emailOrLogin,
    );
    return user || null;
  }

  async create(user: UserEntity): Promise<UserEntity> {
    this.users.push(user);
    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = this.users.find((candidate) => candidate.email === email);
    return user || null;
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
