import { UserEntity } from "../../entity/user/user-entity.js";
import { IUsersRepository } from "./user-repository.js";

export class InMemoryUsersRepository implements IUsersRepository {
  private users: UserEntity[] = [];

  async findByEmailOrLogin(emailOrLogin: string): Promise<UserEntity | null> {
    const user = this.users.find(
      (user) => user.email === emailOrLogin || user.login === emailOrLogin
    );
    return user || null;
  }

  async create(user: UserEntity): Promise<UserEntity> {
    this.users.push(user);
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
