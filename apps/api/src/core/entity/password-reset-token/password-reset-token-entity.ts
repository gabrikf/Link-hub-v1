import { BaseEntity, BaseEntityProps } from "../index.js";

export interface PasswordResetTokenEntityProps extends BaseEntityProps {
  userId: string;
  /**
   * sha256 hex of the raw token. Same storage rule as
   * `email_verification_tokens`: the raw value exists in the emailed link and
   * in the request body that comes back, and nowhere else. A reset token IS a
   * password, so a table holding usable ones would be worse than a table of
   * password hashes.
   */
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

export interface CreatePasswordResetTokenEntityProps {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date | null; // Optional at creation, but will be normalized to null
}

export class PasswordResetTokenEntity extends BaseEntity<PasswordResetTokenEntityProps> {
  public userId: string;
  public tokenHash: string;
  public expiresAt: Date;
  public consumedAt: Date | null;

  constructor(props: PasswordResetTokenEntityProps) {
    super(props);
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.consumedAt = props.consumedAt ?? null;
  }

  isExpired(now: Date = new Date()): boolean {
    return now > this.expiresAt;
  }

  isConsumed(): boolean {
    return this.consumedAt !== null;
  }

  /**
   * One method for both failure modes, so the two can never drift apart at the
   * call site and start producing two distinguishable errors.
   */
  isUsable(now: Date = new Date()): boolean {
    return !this.isConsumed() && !this.isExpired(now);
  }

  consume(consumedAt: Date = new Date()) {
    if (this.consumedAt !== null) {
      return;
    }
    this.consumedAt = consumedAt;
    this.updateTimestamp();
  }
}
