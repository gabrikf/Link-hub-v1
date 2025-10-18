import { eq, or } from "drizzle-orm";
import { UserEntity } from "../../../../core/entity/user/user-entity.js";
import { IUsersRepository } from "../../../../core/repositories/user/user-repository.js";
import { db } from "../index.js";
import { users } from "../schema.js";

export class DrizzleUserRepository implements IUsersRepository {
  async findByEmailOrLogin(login: string): Promise<UserEntity | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(or(...[eq(users.email, login), eq(users.login, login)]));

    if (!user) return null;

    // Map database fields (snake_case) to entity fields (camelCase)
    return new UserEntity({
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      password: user.password,
      description: user.description,
      avatarUrl: user.avatarUrl,
      googleId: user.googleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  }

  async create(user: UserEntity): Promise<UserEntity> {
    // Map entity fields (camelCase) to database fields (snake_case)
    const [createdUser] = await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        login: user.login,
        name: user.name,
        password: user.password,
        description: user.description,
        avatarUrl: user.avatarUrl,
        googleId: user.googleId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .returning();

    // Map database fields back to entity fields
    return new UserEntity({
      id: createdUser.id,
      email: createdUser.email,
      login: createdUser.login,
      name: createdUser.name,
      password: createdUser.password,
      description: createdUser.description,
      avatarUrl: createdUser.avatarUrl,
      googleId: createdUser.googleId,
      createdAt: createdUser.createdAt,
      updatedAt: createdUser.updatedAt,
    });
  }
}
