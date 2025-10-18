import { BaseEntity, BaseEntityProps } from "../index.js";

export interface UserEntityProps extends BaseEntityProps {
  email: string;
  login: string;
  name: string;
  password: string;
  description: string | null; // Explicit null, not optional
  avatarUrl: string | null; // Explicit null, not optional
  googleId: string | null; // Explicit null, not optional
}

export interface CreateUserEntityProps {
  email: string;
  login: string;
  name: string;
  password: string;
  description?: string | null; // Optional at creation, but will be normalized to null
  avatarUrl?: string | null; // Optional at creation, but will be normalized to null
  googleId?: string | null; // Optional at creation, but will be normalized to null
}

export interface UserEntityPublicDto
  extends Omit<UserEntityProps, "password"> {}

export class UserEntity extends BaseEntity<UserEntityProps> {
  public email: string;
  public login: string;
  public name: string;
  public password: string;
  public description: string | null; // Always null, never undefined
  public avatarUrl: string | null; // Always null, never undefined
  public googleId: string | null; // Always null, never undefined

  constructor(props: UserEntityProps) {
    super(props);
    this.email = props.email;
    this.login = props.login;
    this.name = props.name;
    this.password = props.password;
    // Normalize undefined to null for database consistency
    this.description = props.description ?? null;
    this.avatarUrl = props.avatarUrl ?? null;
    this.googleId = props.googleId ?? null;
  }

  updateAvatarUrl(avatarUrl: string | null) {
    this.avatarUrl = avatarUrl;
    this.updateTimestamp();
  }

  updateDescription(description: string | null) {
    this.description = description;
    this.updateTimestamp();
  }

  updateGoogleId(googleId: string | null) {
    this.googleId = googleId;
    this.updateTimestamp();
  }

  toPublic(): UserEntityPublicDto {
    return {
      id: this.id,
      email: this.email,
      login: this.login,
      name: this.name,
      description: this.description,
      avatarUrl: this.avatarUrl,
      googleId: this.googleId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
