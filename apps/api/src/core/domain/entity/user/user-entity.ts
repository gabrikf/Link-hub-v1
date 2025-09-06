import { BaseEntity } from "../index.js";

export interface UserEntityProps {
  email: string;
  login: string;
  name: string;
  password: string;
  description?: string | null;
  avatarUrl?: string | null;
  googleId?: string | null;
}

export class UserEntity extends BaseEntity<UserEntityProps> {
  public email!: string;
  public login!: string;
  public name!: string;
  public password!: string;
  public description?: string | null;
  public avatarUrl?: string | null;
  public googleId?: string | null;

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

  constructor(
    props: Omit<UserEntityProps, "id" | "createdAt" | "updatedAt">,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date
  ) {
    super(props, id, createdAt, updatedAt);
  }
}
