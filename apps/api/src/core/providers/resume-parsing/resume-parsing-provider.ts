import type { UiLanguage } from "@repo/schemas";

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
  /**
   * The language every free-text field in the result must be written in —
   * `summary`, `profileDescription`, `headlineTitle` and each work experience's
   * `description`.
   *
   * Required, not optional, on purpose: this used to be decided implicitly by
   * whatever language the model felt like answering in. A caller that has to
   * name a language cannot silently forget to, and `resolveResponseLanguage`
   * always has an answer, so there is no honest reason to omit it.
   *
   * It says nothing about the structured parts of the response. Enum values,
   * JSON keys and ISO dates are wire values matched against
   * `parsedResumeDataSchema`; translating them breaks the parse.
   */
  language: UiLanguage;
}

export interface IResumeParsingProvider {
  parseResume(input: ResumeParsingInput): Promise<ParsedResume>;
}
