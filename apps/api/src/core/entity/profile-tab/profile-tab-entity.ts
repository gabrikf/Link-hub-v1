import { ProfileViewport } from "@repo/schemas";
import { BaseEntity, type BaseEntityProps } from "../index.js";

/**
 * A content tab of ONE viewport. Tabs are not mirrored: the pc and mobile
 * layouts own separate sets of tabs, so there is no cross-viewport identity to
 * carry here.
 */
export interface ProfileTabEntityProps extends BaseEntityProps {
  userId: string;
  viewport: ProfileViewport;
  title: string;
  order: number;
}

export interface CreateProfileTabEntityProps {
  userId: string;
  viewport: ProfileViewport;
  title: string;
  order?: number;
}

export class ProfileTabEntity extends BaseEntity<ProfileTabEntityProps> {
  public userId: string;
  public viewport: ProfileViewport;
  public title: string;
  public order: number;

  constructor(props: ProfileTabEntityProps) {
    super(props);
    this.userId = props.userId;
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
