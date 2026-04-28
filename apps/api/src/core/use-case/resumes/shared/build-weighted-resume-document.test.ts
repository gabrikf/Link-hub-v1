import { describe, expect, it } from "vitest";
import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { buildWeightedResumeDocument } from "./build-weighted-resume-document.js";

describe("buildWeightedResumeDocument", () => {
  it("weights skills higher than titles and the rest", () => {
    const resume = ResumeEntity.create({
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
    });

    const skills = [
      ResumeSkillEntity.create({
        resumeId: "resume-1",
        skillId: "skill-1",
        skillName: "TypeScript",
        yearsExperience: 5,
        displayOrder: 0,
      }),
    ];

    const titles = [
      ResumeTitleEntity.create({
        resumeId: "resume-1",
        titleId: "title-1",
        titleName: "Senior Engineer",
        isPrimary: true,
        displayOrder: 0,
      }),
    ];

    const document = buildWeightedResumeDocument({
      resume,
      skills,
      titles,
    });

    const skillMatches = document.match(/skill: TypeScript/g) ?? [];
    const titleMatches = document.match(/title: Senior Engineer/g) ?? [];
    const summaryMatches = document.match(/summary: Builds APIs/g) ?? [];

    expect(skillMatches).toHaveLength(3);
    expect(titleMatches).toHaveLength(2);
    expect(summaryMatches).toHaveLength(1);
  });
});
