import { EmailVerificationTokenEntity } from "../../entity/email-verification-token/email-verification-token-entity.js";

export interface IEmailVerificationTokenRepository {
  /** Persist a freshly minted token. Only the hash is stored. */
  create(
    token: EmailVerificationTokenEntity,
  ): Promise<EmailVerificationTokenEntity>;

  /**
   * Look a token up by the sha256 of the value the user presented. Returns
   * expired and already-consumed rows too — deciding what to do with them is
   * the use case's job, and a repository that hid them would make "unknown" and
   * "expired" indistinguishable to the code that must treat them identically
   * *on purpose*, rather than by accident.
   */
  findByTokenHash(
    tokenHash: string,
  ): Promise<EmailVerificationTokenEntity | null>;

  /** Most recently created token for a user. Backs the resend cooldown. */
  findLatestByUserId(
    userId: string,
  ): Promise<EmailVerificationTokenEntity | null>;

  /**
   * Stamp `consumed_at` on every outstanding token for this user.
   *
   * One statement rather than "consume the one that was used, then sweep the
   * rest": a successful verification must invalidate the older links sitting in
   * the user's inbox, and doing it in two steps leaves a window where a second
   * link still works.
   */
  consumeAllForUser(userId: string, consumedAt: Date): Promise<void>;

  /** Housekeeping: drop rows that can no longer be used. */
  deleteExpired(): Promise<void>;
}
