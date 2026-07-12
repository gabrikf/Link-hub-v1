import { ApiTokenEntity } from "../../entity/api-token/api-token-entity.js";

export interface IApiTokenRepository {
  create(apiToken: ApiTokenEntity): Promise<ApiTokenEntity>;
  findByTokenHash(tokenHash: string): Promise<ApiTokenEntity | null>;
  findById(id: string): Promise<ApiTokenEntity | null>;
  listByUserId(userId: string): Promise<ApiTokenEntity[]>;
  revoke(id: string): Promise<void>;
  touchLastUsed(id: string): Promise<void>;
}
