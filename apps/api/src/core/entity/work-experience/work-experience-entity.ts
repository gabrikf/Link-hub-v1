import { BaseEntity, type BaseEntityProps } from "../index.js";

export interface WorkExperienceEntityProps extends BaseEntityProps {
  userId: string;
  title: string;
  companyName: string;
  employmentType: string | null;
  workModel: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  mainStack: string[];
  displayOrder: number;
}

export class WorkExperienceEntity extends BaseEntity<WorkExperienceEntityProps> {
  userId: string;
  title: string;
  companyName: string;
  employmentType: string | null;
  workModel: string | null;
  locationCity: string | null;
  locationState: string | null;
  locationCountry: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
  mainStack: string[];
  displayOrder: number;

  constructor(props: WorkExperienceEntityProps) {
    super(props);
    this.userId = props.userId;
    this.title = props.title;
    this.companyName = props.companyName;
    this.employmentType = props.employmentType ?? null;
    this.workModel = props.workModel ?? null;
    this.locationCity = props.locationCity ?? null;
    this.locationState = props.locationState ?? null;
    this.locationCountry = props.locationCountry ?? null;
    this.startDate = props.startDate ?? null;
    this.endDate = props.endDate ?? null;
    this.isCurrent = props.isCurrent;
    this.description = props.description ?? null;
    this.mainStack = props.mainStack ?? [];
    this.displayOrder = props.displayOrder;
  }

  updateContent(
    data: Partial<
      Omit<
        WorkExperienceEntityProps,
        "id" | "createdAt" | "updatedAt" | "userId"
      >
    >,
  ) {
    if (data.title !== undefined) this.title = data.title;
    if (data.companyName !== undefined) this.companyName = data.companyName;
    if (data.employmentType !== undefined)
      this.employmentType = data.employmentType;
    if (data.workModel !== undefined) this.workModel = data.workModel;
    if (data.locationCity !== undefined) this.locationCity = data.locationCity;
    if (data.locationState !== undefined)
      this.locationState = data.locationState;
    if (data.locationCountry !== undefined)
      this.locationCountry = data.locationCountry;
    if (data.startDate !== undefined) this.startDate = data.startDate;
    if (data.endDate !== undefined) this.endDate = data.endDate;
    if (data.isCurrent !== undefined) this.isCurrent = data.isCurrent;
    if (data.description !== undefined) this.description = data.description;
    if (data.mainStack !== undefined) this.mainStack = data.mainStack;
    if (data.displayOrder !== undefined) this.displayOrder = data.displayOrder;

    // A current role can't keep a stale end date.
    if (this.isCurrent) {
      this.endDate = null;
    }

    this.updateTimestamp();
  }
}
