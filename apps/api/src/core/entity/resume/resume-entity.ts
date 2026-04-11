import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface ResumeEntityProps extends BaseEntityProps {
  userId: string;
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  location: string | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;
}

export interface CreateResumeEntityProps {
  userId: string;
  headlineTitle?: string | null;
  summary?: string | null;
  totalYearsExperience?: number | null;
  location?: string | null;
  seniorityLevel?: string | null;
  workModel?: string | null;
  contractType?: string | null;
  salaryExpectationMin?: number | null;
  salaryExpectationMax?: number | null;
  spokenLanguages?: string[];
  noticePeriod?: string | null;
  openToRelocation?: boolean;
}

export class ResumeEntity extends BaseEntity<ResumeEntityProps> {
  userId: string;
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  location: string | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;

  constructor(props: ResumeEntityProps) {
    super(props);
    this.userId = props.userId;
    this.headlineTitle = props.headlineTitle ?? null;
    this.summary = props.summary ?? null;
    this.totalYearsExperience = props.totalYearsExperience ?? null;
    this.location = props.location ?? null;
    this.seniorityLevel = props.seniorityLevel ?? null;
    this.workModel = props.workModel ?? null;
    this.contractType = props.contractType ?? null;
    this.salaryExpectationMin = props.salaryExpectationMin ?? null;
    this.salaryExpectationMax = props.salaryExpectationMax ?? null;
    this.spokenLanguages = props.spokenLanguages ?? [];
    this.noticePeriod = props.noticePeriod ?? null;
    this.openToRelocation = props.openToRelocation;
  }

  updateContent(
    data: Partial<
      Omit<ResumeEntityProps, "id" | "createdAt" | "updatedAt" | "userId">
    >,
  ) {
    if (data.headlineTitle !== undefined)
      this.headlineTitle = data.headlineTitle;
    if (data.summary !== undefined) this.summary = data.summary;
    if (data.totalYearsExperience !== undefined) {
      this.totalYearsExperience = data.totalYearsExperience;
    }
    if (data.location !== undefined) this.location = data.location;
    if (data.seniorityLevel !== undefined)
      this.seniorityLevel = data.seniorityLevel;
    if (data.workModel !== undefined) this.workModel = data.workModel;
    if (data.contractType !== undefined) this.contractType = data.contractType;
    if (data.salaryExpectationMin !== undefined) {
      this.salaryExpectationMin = data.salaryExpectationMin;
    }
    if (data.salaryExpectationMax !== undefined) {
      this.salaryExpectationMax = data.salaryExpectationMax;
    }
    if (data.spokenLanguages !== undefined)
      this.spokenLanguages = data.spokenLanguages;
    if (data.noticePeriod !== undefined) this.noticePeriod = data.noticePeriod;
    if (data.openToRelocation !== undefined) {
      this.openToRelocation = data.openToRelocation;
    }

    this.updateTimestamp();
  }
}
