import { UserEntity } from "../../entity/user/user-entity.js";

export interface IUsersRepository {
  findByEmailOrLogin(login: string): Promise<UserEntity | null>;
  create(user: UserEntity): Promise<UserEntity>;
}
