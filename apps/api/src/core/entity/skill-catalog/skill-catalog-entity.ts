import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface SkillCatalogEntityProps extends BaseEntityProps {
  name: string;
  normalizedName: string;
  isDefault: boolean;
  createdByUserId: string | null;
}

export class SkillCatalogEntity extends BaseEntity<SkillCatalogEntityProps> {
  name: string;
  normalizedName: string;
  isDefault: boolean;
  createdByUserId: string | null;

  constructor(props: SkillCatalogEntityProps) {
    super(props);
    this.name = props.name;
    this.normalizedName = props.normalizedName;
    this.isDefault = props.isDefault;
    this.createdByUserId = props.createdByUserId ?? null;
  }
}
