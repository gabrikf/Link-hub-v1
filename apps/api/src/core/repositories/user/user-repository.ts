import { UserEntity } from "../../entity/user/user-entity.js";

export interface IUsersRepository {
  findByEmailOrLogin(login: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  findByGoogleId(googleId: string): Promise<UserEntity | null>;
  update(user: UserEntity): Promise<UserEntity>;
  create(user: UserEntity): Promise<UserEntity>;
}
