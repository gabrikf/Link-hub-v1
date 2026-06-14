import {
  IResumeParsingProvider,
  ParsedResume,
  ResumeParsingInput,
} from "../../core/providers/resume-parsing/resume-parsing-provider.js";

const COMMON_LANGUAGES = [
  "English",
  "Portuguese",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Mandarin",
  "Japanese",
];

function matchKnownTerms(text: string, terms: string[]): string[] {
  const haystack = text.toLowerCase();
  return terms.filter((term) => {
    const needle = term.toLowerCase();
    return needle.length > 1 && haystack.includes(needle);
  });
}

function firstParagraph(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, 400);
}

/**
 * Heuristic, offline fallback used when no LLM API key is configured. It cannot
 * reconstruct full work history, but it surfaces matching skills/titles/languages
 * so the import flow still produces something useful in local/dev environments.
 */
export class DeterministicResumeParsingProvider
  implements IResumeParsingProvider
{
  async parseResume(input: ResumeParsingInput): Promise<ParsedResume> {
    const { resumeText, knownSkills, knownTitles } = input;
    const summary = firstParagraph(resumeText);

    return {
      headlineTitle: null,
      summary,
      totalYearsExperience: null,
      location: null,
      seniorityLevel: null,
      workModel: null,
      contractType: null,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      spokenLanguages: matchKnownTerms(resumeText, COMMON_LANGUAGES),
      noticePeriod: null,
      openToRelocation: null,
      skills: matchKnownTerms(resumeText, knownSkills),
      titles: matchKnownTerms(resumeText, knownTitles),
      workExperiences: [],
      profileName: null,
      profileDescription: summary,
    };
  }
}
