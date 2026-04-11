import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface TitleCatalogEntityProps extends BaseEntityProps {
  name: string;
  normalizedName: string;
  isDefault: boolean;
  createdByUserId: string | null;
}

export class TitleCatalogEntity extends BaseEntity<TitleCatalogEntityProps> {
  name: string;
  normalizedName: string;
  isDefault: boolean;
  createdByUserId: string | null;

  constructor(props: TitleCatalogEntityProps) {
    super(props);
    this.name = props.name;
    this.normalizedName = props.normalizedName;
    this.isDefault = props.isDefault;
    this.createdByUserId = props.createdByUserId ?? null;
  }
}
