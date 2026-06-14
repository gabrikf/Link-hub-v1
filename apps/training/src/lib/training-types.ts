export interface WorkExperienceTrainingRow {
  title: string | null;
  companyName: string | null;
  description: string | null;
  mainStack: string[];
}

export interface ResumeTrainingRow {
  resumeId: string;
  queryText: string | null;
  headlineTitle: string | null;
  summary: string | null;
  totalYearsExperience: number | null;
  seniorityLevel: string | null;
  workModel: string | null;
  contractType: string | null;
  location: string | null;
  spokenLanguages: string[];
  noticePeriod: string | null;
  openToRelocation: boolean;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  skills: string[];
  titles: string[];
  workExperiences: WorkExperienceTrainingRow[];
  interactionScore: number;
}

export interface TrainingState {
  lastTrainingAt: string;
}
