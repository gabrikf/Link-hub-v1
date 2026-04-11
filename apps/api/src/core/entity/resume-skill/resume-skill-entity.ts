import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ResumeSkillEntityProps extends BaseEntityProps {
  resumeId: string;
  skillId: string;
  skillName: string;
  yearsExperience: number | null;
  displayOrder: number;
}

export class ResumeSkillEntity extends BaseEntity<ResumeSkillEntityProps> {
  resumeId: string;
  skillId: string;
  skillName: string;
  yearsExperience: number | null;
  displayOrder: number;

  constructor(props: ResumeSkillEntityProps) {
    super(props);
    this.resumeId = props.resumeId;
    this.skillId = props.skillId;
    this.skillName = props.skillName;
    this.yearsExperience = props.yearsExperience ?? null;
    this.displayOrder = props.displayOrder;
  }
}
