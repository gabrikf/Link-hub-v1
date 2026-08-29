import { PasswordResetTokenEntity } from "../../entity/password-reset-token/password-reset-token-entity.js";

export interface IPasswordResetTokenRepository {
  create(token: PasswordResetTokenEntity): Promise<PasswordResetTokenEntity>;

  /**
   * Look a token up by the sha256 of the presented value. Returns expired and
   * consumed rows too — treating them identically is the use case's job, and
   * doing it there makes the sameness deliberate rather than accidental.
   */
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenEntity | null>;

  /** Most recently created token for a user. Backs the per-email cooldown. */
  findLatestByUserId(userId: string): Promise<PasswordResetTokenEntity | null>;

  /**
   * Stamp `consumed_at` on every outstanding token for this user.
   *
   * Used TWICE in this flow, which is the point: on issue, so only the newest
   * link works, and on a successful reset, so no link survives the password
   * change it authorised.
   */
  consumeAllForUser(userId: string, consumedAt: Date): Promise<void>;

  deleteExpired(): Promise<void>;
}
