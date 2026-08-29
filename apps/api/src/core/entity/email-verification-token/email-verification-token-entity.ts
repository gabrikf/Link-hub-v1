import { BaseEntity, BaseEntityProps } from "../index.js";

export interface EmailVerificationTokenEntityProps extends BaseEntityProps {
  userId: string;
  /**
   * sha256 hex of the raw token. The raw value NEVER reaches this entity or the
   * database — it exists only in the emailed link and in the request body that
   * comes back. A leaked table dump therefore yields nothing an attacker can
   * present, which is the same reason `api_tokens` stores a hash.
   */
  tokenHash: string;
  expiresAt: Date;
  /** When this token was spent. Non-null means it can never be used again. */
  consumedAt: Date | null;
}

export interface CreateEmailVerificationTokenEntityProps {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt?: Date | null; // Optional at creation, but will be normalized to null
}

export class EmailVerificationTokenEntity extends BaseEntity<EmailVerificationTokenEntityProps> {
  public userId: string;
  public tokenHash: string;
  public expiresAt: Date;
  public consumedAt: Date | null;

  constructor(props: EmailVerificationTokenEntityProps) {
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
   * The single question the verify use case asks. Kept as one method so the two
   * failure modes cannot drift apart at the call site and start producing two
   * distinguishable errors — telling a caller "expired" rather than "unknown"
   * confirms the token was real.
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
