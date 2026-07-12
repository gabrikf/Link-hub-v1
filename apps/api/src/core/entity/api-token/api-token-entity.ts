import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ApiTokenEntityProps extends BaseEntityProps {
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface CreateApiTokenEntityProps {
  userId: string;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
}

export class ApiTokenEntity extends BaseEntity<ApiTokenEntityProps> {
  public userId: string;
  public name: string;
  public tokenHash: string;
  public tokenPrefix: string;
  public scopes: string[];
  public expiresAt: Date | null;
  public lastUsedAt: Date | null;
  public revokedAt: Date | null;

  constructor(props: ApiTokenEntityProps) {
    super(props);
    this.userId = props.userId;
    this.name = props.name;
    this.tokenHash = props.tokenHash;
    this.tokenPrefix = props.tokenPrefix;
    this.scopes = props.scopes;
    this.expiresAt = props.expiresAt ?? null;
    this.lastUsedAt = props.lastUsedAt ?? null;
    this.revokedAt = props.revokedAt ?? null;
  }

  revoke() {
    this.revokedAt = new Date();
    this.updateTimestamp();
  }

  touchLastUsed() {
    this.lastUsedAt = new Date();
  }

  isActive(now: Date = new Date()): boolean {
    if (this.revokedAt !== null) {
      return false;
    }
    if (this.expiresAt !== null && this.expiresAt.getTime() <= now.getTime()) {
      return false;
    }
    return true;
  }

  hasScope(scope: string): boolean {
    return this.scopes.includes(scope);
  }

  /** Public serialization — never exposes the token hash. */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      tokenPrefix: this.tokenPrefix,
      scopes: this.scopes,
      expiresAt: this.expiresAt,
      lastUsedAt: this.lastUsedAt,
      createdAt: this.createdAt,
      revokedAt: this.revokedAt,
    };
  }
}
