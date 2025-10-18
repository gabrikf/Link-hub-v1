import { RefreshTokenEntity } from "../../entity/refresh-token/refresh-token-entity.js";

export interface IRefreshTokenRepository {
  /**
   * Create a new refresh token
   */
  create(refreshToken: RefreshTokenEntity): Promise<RefreshTokenEntity>;

  /**
   * Find a refresh token by its token string
   */
  findByToken(token: string): Promise<RefreshTokenEntity | null>;

  /**
   * Find all refresh tokens for a specific user
   */
  findByUserId(userId: string): Promise<RefreshTokenEntity[]>;

  /**
   * Delete a refresh token by its token string
   */
  deleteByToken(token: string): Promise<void>;

  /**
   * Delete all refresh tokens for a specific user
   */
  deleteByUserId(userId: string): Promise<void>;

  /**
   * Delete expired refresh tokens (for cleanup)
   */
  deleteExpired(): Promise<void>;
}
