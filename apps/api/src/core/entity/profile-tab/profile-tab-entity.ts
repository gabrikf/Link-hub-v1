import { ProfileViewport } from "@repo/schemas";
import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ProfileTabEntityProps extends BaseEntityProps {
  userId: string;
  /** Shared logical identity linking the pc-row and mobile-row of this tab. */
  groupId?: string;
  viewport: ProfileViewport;
  title: string;
  order: number;
}

export interface CreateProfileTabEntityProps {
  userId: string;
  groupId?: string;
  viewport: ProfileViewport;
  title: string;
  order?: number;
}

export class ProfileTabEntity extends BaseEntity<ProfileTabEntityProps> {
  public userId: string;
  public groupId: string;
  public viewport: ProfileViewport;
  public title: string;
  public order: number;

  constructor(props: ProfileTabEntityProps) {
    super(props);
    this.userId = props.userId;
    this.groupId = props.groupId ?? crypto.randomUUID();
    this.viewport = props.viewport;
    this.title = props.title;
    this.order = props.order;
  }

  rename(title: string) {
    this.title = title;
    this.updateTimestamp();
  }

  reorderTo(order: number) {
    this.order = order;
    this.updateTimestamp();
  }
}
