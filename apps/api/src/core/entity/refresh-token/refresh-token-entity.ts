import { BaseEntity, BaseEntityProps } from "../index.js";

export interface RefreshTokenEntityProps extends BaseEntityProps {
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface CreateRefreshTokenEntityProps {
  userId: string;
  token: string;
  expiresAt: Date;
}

export class RefreshTokenEntity extends BaseEntity<RefreshTokenEntityProps> {
  public userId: string;
  public token: string;
  public expiresAt: Date;

  constructor(props: RefreshTokenEntityProps) {
    super(props);
    this.userId = props.userId;
    this.token = props.token;
    this.expiresAt = props.expiresAt;
  }

  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  isValid(): boolean {
    return !this.isExpired();
  }
}
