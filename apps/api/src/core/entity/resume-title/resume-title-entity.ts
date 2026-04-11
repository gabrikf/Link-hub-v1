import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ResumeTitleEntityProps extends BaseEntityProps {
  resumeId: string;
  titleId: string;
  titleName: string;
  isPrimary: boolean;
  displayOrder: number;
}

export class ResumeTitleEntity extends BaseEntity<ResumeTitleEntityProps> {
  resumeId: string;
  titleId: string;
  titleName: string;
  isPrimary: boolean;
  displayOrder: number;

  constructor(props: ResumeTitleEntityProps) {
    super(props);
    this.resumeId = props.resumeId;
    this.titleId = props.titleId;
    this.titleName = props.titleName;
    this.isPrimary = props.isPrimary;
    this.displayOrder = props.displayOrder;
  }
}
