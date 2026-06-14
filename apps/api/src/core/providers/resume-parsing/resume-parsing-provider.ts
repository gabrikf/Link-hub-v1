export interface ParsedWorkExperience {
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
}

export interface ParsedResume {
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
  openToRelocation: boolean | null;
  skills: string[];
  titles: string[];
  workExperiences: ParsedWorkExperience[];
  profileName: string | null;
  profileDescription: string | null;
}

export interface ResumeParsingInput {
  resumeText: string;
  knownSkills: string[];
  knownTitles: string[];
}

export interface IResumeParsingProvider {
  parseResume(input: ResumeParsingInput): Promise<ParsedResume>;
}
