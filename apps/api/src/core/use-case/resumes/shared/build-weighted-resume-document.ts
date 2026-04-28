import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";

function repeatWeighted(value: string, weight: number) {
  return Array.from({ length: Math.max(1, weight) }, () => value).join(" ");
}

export interface BuildWeightedResumeDocumentInput {
  resume: ResumeEntity;
  skills: ResumeSkillEntity[];
  titles: ResumeTitleEntity[];
}

export function buildWeightedResumeDocument(
  input: BuildWeightedResumeDocumentInput,
) {
  const chunks: string[] = [];

  for (const skill of input.skills) {
    chunks.push(repeatWeighted(`skill: ${skill.skillName}`, 3));
  }

  for (const title of input.titles) {
    chunks.push(repeatWeighted(`title: ${title.titleName}`, 2));
  }

  if (input.resume.headlineTitle) {
    chunks.push(`headline: ${input.resume.headlineTitle}`);
  }

  if (input.resume.summary) {
    chunks.push(`summary: ${input.resume.summary}`);
  }

  if (input.resume.totalYearsExperience !== null) {
    chunks.push(`experience_years: ${input.resume.totalYearsExperience}`);
  }

  if (input.resume.location) {
    chunks.push(`location: ${input.resume.location}`);
  }

  if (input.resume.seniorityLevel) {
    chunks.push(`seniority: ${input.resume.seniorityLevel}`);
  }

  if (input.resume.workModel) {
    chunks.push(`work_model: ${input.resume.workModel}`);
  }

  if (input.resume.contractType) {
    chunks.push(`contract_type: ${input.resume.contractType}`);
  }

  if (input.resume.salaryExpectationMin !== null) {
    chunks.push(`salary_min: ${input.resume.salaryExpectationMin}`);
  }

  if (input.resume.salaryExpectationMax !== null) {
    chunks.push(`salary_max: ${input.resume.salaryExpectationMax}`);
  }

  if (input.resume.spokenLanguages.length > 0) {
    chunks.push(`languages: ${input.resume.spokenLanguages.join(", ")}`);
  }

  if (input.resume.noticePeriod) {
    chunks.push(`notice_period: ${input.resume.noticePeriod}`);
  }

  chunks.push(`open_to_relocation: ${input.resume.openToRelocation}`);

  return chunks.join("\n");
}
