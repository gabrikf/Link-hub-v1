import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";

/**
 * Field weights for the recruiter-facing embedding document.
 *
 * Token repetition is a deliberate, well-understood technique for biasing a
 * single dense embedding toward the signals recruiters actually search on.
 * Skills are the strongest predictor of a good match, so they dominate; titles
 * and concrete job history are the next most discriminating signals; the rest
 * (summary, seniority, location, logistics) provide context at base weight.
 */
export const RESUME_DOCUMENT_WEIGHTS = {
  skill: 4,
  title: 2,
  jobHistory: 2,
  base: 1,
} as const;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function repeatWeighted(value: string, weight: number): string {
  const normalized = normalize(value);
  if (!normalized) {
    return "";
  }
  return Array.from({ length: Math.max(1, weight) }, () => normalized).join(
    " ",
  );
}

/**
 * Dedupes case-insensitively while preserving the first-seen casing and order.
 */
function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }
    const normalized = normalize(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function formatWorkExperienceLocation(
  experience: WorkExperienceEntity,
): string | null {
  const parts = dedupe([
    experience.locationCity,
    experience.locationState,
    experience.locationCountry,
  ]);
  return parts.length > 0 ? parts.join(", ") : null;
}

export interface BuildWeightedResumeDocumentInput {
  resume: ResumeEntity;
  skills: ResumeSkillEntity[];
  titles: ResumeTitleEntity[];
  workExperiences?: WorkExperienceEntity[];
}

/**
 * Builds the weighted text document that gets embedded for a resume. Everything
 * a recruiter could reasonably search on is included; the most decisive signals
 * (skills, titles, job history) are repeated so they carry more weight in the
 * resulting vector.
 */
export function buildWeightedResumeDocument(
  input: BuildWeightedResumeDocumentInput,
): string {
  const chunks: string[] = [];

  const skillNames = dedupe(input.skills.map((skill) => skill.skillName));
  for (const skillName of skillNames) {
    chunks.push(
      repeatWeighted(`skill: ${skillName}`, RESUME_DOCUMENT_WEIGHTS.skill),
    );
  }

  // Years of experience per skill add depth, but at base weight so they don't
  // drown out the skill names themselves.
  for (const skill of input.skills) {
    if (skill.yearsExperience !== null && skill.skillName) {
      chunks.push(
        `skill_experience: ${normalize(skill.skillName)} ${skill.yearsExperience}y`,
      );
    }
  }

  const titleNames = dedupe(input.titles.map((title) => title.titleName));
  for (const titleName of titleNames) {
    chunks.push(
      repeatWeighted(`title: ${titleName}`, RESUME_DOCUMENT_WEIGHTS.title),
    );
  }

  // Job history: the roles a candidate actually held, the companies, the stack
  // they used, and what they did. Weighted x2 because real experience is a
  // strong signal of fit beyond self-declared skills/titles.
  const workExperiences = [...(input.workExperiences ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  for (const experience of workExperiences) {
    const headline = normalize(
      `${experience.title} at ${experience.companyName}`,
    );
    if (headline) {
      chunks.push(
        repeatWeighted(
          `experience: ${headline}`,
          RESUME_DOCUMENT_WEIGHTS.jobHistory,
        ),
      );
    }

    const stack = dedupe(experience.mainStack);
    if (stack.length > 0) {
      chunks.push(
        repeatWeighted(
          `experience_stack: ${stack.join(", ")}`,
          RESUME_DOCUMENT_WEIGHTS.jobHistory,
        ),
      );
    }

    if (experience.description) {
      chunks.push(`experience_detail: ${normalize(experience.description)}`);
    }

    const where = formatWorkExperienceLocation(experience);
    if (where) {
      chunks.push(`experience_location: ${where}`);
    }
  }

  if (input.resume.headlineTitle) {
    chunks.push(`headline: ${normalize(input.resume.headlineTitle)}`);
  }

  if (input.resume.summary) {
    chunks.push(`summary: ${normalize(input.resume.summary)}`);
  }

  if (input.resume.totalYearsExperience !== null) {
    chunks.push(`experience_years: ${input.resume.totalYearsExperience}`);
  }

  if (input.resume.location) {
    chunks.push(`location: ${normalize(input.resume.location)}`);
  }

  if (input.resume.seniorityLevel) {
    chunks.push(`seniority: ${normalize(input.resume.seniorityLevel)}`);
  }

  if (input.resume.workModel) {
    chunks.push(`work_model: ${normalize(input.resume.workModel)}`);
  }

  if (input.resume.contractType) {
    chunks.push(`contract_type: ${normalize(input.resume.contractType)}`);
  }

  if (input.resume.salaryExpectationMin !== null) {
    chunks.push(`salary_min: ${input.resume.salaryExpectationMin}`);
  }

  if (input.resume.salaryExpectationMax !== null) {
    chunks.push(`salary_max: ${input.resume.salaryExpectationMax}`);
  }

  const languages = dedupe(input.resume.spokenLanguages);
  if (languages.length > 0) {
    chunks.push(`languages: ${languages.join(", ")}`);
  }

  if (input.resume.noticePeriod) {
    chunks.push(`notice_period: ${normalize(input.resume.noticePeriod)}`);
  }

  chunks.push(`open_to_relocation: ${input.resume.openToRelocation}`);

  return chunks.filter((chunk) => chunk.length > 0).join("\n");
}
