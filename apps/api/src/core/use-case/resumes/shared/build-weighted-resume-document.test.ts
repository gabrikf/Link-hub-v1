import { describe, expect, it } from "vitest";
import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  buildWeightedResumeDocument,
  RESUME_DOCUMENT_WEIGHTS,
} from "./build-weighted-resume-document.js";

function makeResume(overrides: Partial<Parameters<typeof ResumeEntity.create>[0]> = {}) {
  return ResumeEntity.create({
    userId: "user-1",
    headlineTitle: "Backend Engineer",
    summary: "Builds APIs",
    totalYearsExperience: null,
    location: null,
    seniorityLevel: null,
    workModel: null,
    contractType: null,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    spokenLanguages: [],
    noticePeriod: null,
    openToRelocation: true,
    ...overrides,
  });
}

function makeSkill(name: string, displayOrder = 0, yearsExperience: number | null = null) {
  return ResumeSkillEntity.create({
    resumeId: "resume-1",
    skillId: `skill-${name}`,
    skillName: name,
    yearsExperience,
    displayOrder,
  });
}

function makeTitle(name: string, displayOrder = 0) {
  return ResumeTitleEntity.create({
    resumeId: "resume-1",
    titleId: `title-${name}`,
    titleName: name,
    isPrimary: displayOrder === 0,
    displayOrder,
  });
}

function makeWorkExperience(
  overrides: Partial<Parameters<typeof WorkExperienceEntity.create>[0]> = {},
) {
  return WorkExperienceEntity.create({
    userId: "user-1",
    title: "Senior Engineer",
    companyName: "Acme",
    employmentType: null,
    workModel: null,
    locationCity: null,
    locationState: null,
    locationCountry: null,
    startDate: null,
    endDate: null,
    isCurrent: false,
    description: null,
    mainStack: [],
    displayOrder: 0,
    ...overrides,
  });
}

describe("buildWeightedResumeDocument", () => {
  it("weights skills x4, titles x2, and base content x1", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume(),
      skills: [makeSkill("TypeScript")],
      titles: [makeTitle("Senior Engineer")],
    });

    const skillMatches = document.match(/skill: TypeScript/g) ?? [];
    const titleMatches = document.match(/title: Senior Engineer/g) ?? [];
    const summaryMatches = document.match(/summary: Builds APIs/g) ?? [];

    expect(skillMatches).toHaveLength(RESUME_DOCUMENT_WEIGHTS.skill);
    expect(titleMatches).toHaveLength(RESUME_DOCUMENT_WEIGHTS.title);
    expect(summaryMatches).toHaveLength(RESUME_DOCUMENT_WEIGHTS.base);
    expect(RESUME_DOCUMENT_WEIGHTS.skill).toBeGreaterThan(
      RESUME_DOCUMENT_WEIGHTS.title,
    );
    expect(RESUME_DOCUMENT_WEIGHTS.title).toBeGreaterThan(
      RESUME_DOCUMENT_WEIGHTS.base,
    );
  });

  it("includes job history weighted x2 with role, company and stack", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume(),
      skills: [],
      titles: [],
      workExperiences: [
        makeWorkExperience({
          title: "Staff Engineer",
          companyName: "Globex",
          mainStack: ["Go", "Kubernetes"],
          description: "Led platform team",
        }),
      ],
    });

    const experienceMatches =
      document.match(/experience: Staff Engineer at Globex/g) ?? [];
    const stackMatches =
      document.match(/experience_stack: Go, Kubernetes/g) ?? [];

    expect(experienceMatches).toHaveLength(RESUME_DOCUMENT_WEIGHTS.jobHistory);
    expect(stackMatches).toHaveLength(RESUME_DOCUMENT_WEIGHTS.jobHistory);
    expect(document).toContain("experience_detail: Led platform team");
  });

  it("orders job history by displayOrder", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume(),
      skills: [],
      titles: [],
      workExperiences: [
        makeWorkExperience({
          title: "Second",
          companyName: "B",
          displayOrder: 1,
        }),
        makeWorkExperience({
          title: "First",
          companyName: "A",
          displayOrder: 0,
        }),
      ],
    });

    const firstIndex = document.indexOf("experience: First at A");
    const secondIndex = document.indexOf("experience: Second at B");

    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(secondIndex).toBeGreaterThan(firstIndex);
  });

  it("dedupes skills case-insensitively", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume(),
      skills: [makeSkill("React", 0), makeSkill("react", 1)],
      titles: [],
    });

    const matches = document.match(/skill: React/gi) ?? [];
    // 4 repetitions for a single deduped skill, not 8.
    expect(matches).toHaveLength(RESUME_DOCUMENT_WEIGHTS.skill);
  });

  it("emits per-skill years of experience at base weight", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume(),
      skills: [makeSkill("Rust", 0, 4)],
      titles: [],
    });

    const matches = document.match(/skill_experience: Rust 4y/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("includes all base resume fields a recruiter could search on", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume({
        totalYearsExperience: 8,
        location: "Berlin",
        seniorityLevel: "senior",
        workModel: "remote",
        contractType: "pj",
        salaryExpectationMin: 100000,
        salaryExpectationMax: 160000,
        spokenLanguages: ["English", "Portuguese"],
        noticePeriod: "30 days",
        openToRelocation: true,
      }),
      skills: [],
      titles: [],
    });

    expect(document).toContain("experience_years: 8");
    expect(document).toContain("location: Berlin");
    expect(document).toContain("seniority: senior");
    expect(document).toContain("work_model: remote");
    expect(document).toContain("contract_type: pj");
    expect(document).toContain("salary_min: 100000");
    expect(document).toContain("salary_max: 160000");
    expect(document).toContain("languages: English, Portuguese");
    expect(document).toContain("notice_period: 30 days");
    expect(document).toContain("open_to_relocation: true");
  });

  it("omits empty fields and produces no blank lines", () => {
    const document = buildWeightedResumeDocument({
      resume: makeResume({ summary: null, headlineTitle: null }),
      skills: [],
      titles: [],
    });

    expect(document).not.toContain("summary:");
    expect(document).not.toContain("headline:");
    expect(document.split("\n").every((line) => line.trim().length > 0)).toBe(
      true,
    );
  });
});
