import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface LinkEntityProps extends BaseEntityProps {
  userId: string;
  title: string;
  url: string;
  icon?: string | null;
  isPublic: boolean;
  order: number;
}

export interface CreateLinkEntityProps {
  userId: string;
  title: string;
  url: string;
  icon?: string | null;
  isPublic?: boolean;
  order?: number;
}

export class LinkEntity extends BaseEntity<LinkEntityProps> {
  public userId: string;
  public title: string;
  public url: string;
  public icon: string | null;
  public isPublic: boolean;
  public order: number;

  constructor(props: LinkEntityProps) {
    super(props);
    this.userId = props.userId;
    this.title = props.title;
    this.url = props.url;
    this.icon = props.icon ?? null;
    this.isPublic = props.isPublic;
    this.order = props.order;
  }

  updateContent(
    data: Pick<LinkEntityProps, "title" | "url" | "icon" | "isPublic">,
  ) {
    this.title = data.title;
    this.url = data.url;
    this.icon = data.icon ?? null;
    this.isPublic = data.isPublic;
    this.updateTimestamp();
  }

  updateVisibility(isPublic: boolean) {
    this.isPublic = isPublic;
    this.updateTimestamp();
  }
}
