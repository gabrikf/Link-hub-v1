import { BaseEntity, BaseEntityProps } from "../index.js";

export interface OAuthAccountEntityProps extends BaseEntityProps {
  userId: string;
  provider: string;
  providerAccountId: string;
}

export class OAuthAccountEntity extends BaseEntity<OAuthAccountEntityProps> {
  public userId: string;
  public provider: string;
  public providerAccountId: string;

  constructor(props: OAuthAccountEntityProps) {
    super(props);
    this.userId = props.userId;
    this.provider = props.provider;
    this.providerAccountId = props.providerAccountId;
  }
}
