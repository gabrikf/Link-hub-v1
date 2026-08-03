import { RESUME_EMBEDDING_DOCUMENT_LIMITS } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import { PostEntity } from "../../../entity/post/post-entity.js";
import { ResumeEntity } from "../../../entity/resume/resume-entity.js";
import { ResumeSkillEntity } from "../../../entity/resume-skill/resume-skill-entity.js";
import { ResumeTitleEntity } from "../../../entity/resume-title/resume-title-entity.js";
import { WorkExperienceEntity } from "../../../entity/work-experience/work-experience-entity.js";
import {
  buildPostsSourceDocument,
  buildProfileSourceDocument,
  buildResumeSourceDocuments,
  buildWorkSourceDocument,
} from "./build-resume-source-documents.js";
import { buildWeightedResumeDocument } from "./build-weighted-resume-document.js";

function makeResume() {
  return ResumeEntity.create({
    userId: "user-1",
    headlineTitle: "Backend Engineer",
    summary: "Builds APIs",
    totalYearsExperience: 8,
    location: "Sao Paulo",
    seniorityLevel: "senior",
    workModel: "remote",
    contractType: "pj",
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    spokenLanguages: ["English"],
    noticePeriod: null,
    openToRelocation: true,
  });
}

function makeSkill(name: string, displayOrder = 0) {
  return ResumeSkillEntity.create({
    resumeId: "resume-1",
    skillId: `skill-${name}`,
    skillName: name,
    yearsExperience: null,
    displayOrder,
  });
}

function makeTitle(name: string) {
  return ResumeTitleEntity.create({
    resumeId: "resume-1",
    titleId: `title-${name}`,
    titleName: name,
    isPrimary: true,
    displayOrder: 0,
  });
}

function makeWorkExperience(
  overrides: Partial<Parameters<typeof WorkExperienceEntity.create>[0]> = {},
) {
  return WorkExperienceEntity.create({
    userId: "user-1",
    title: "Staff Engineer",
    companyName: "Globex",
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

function makePost(
  overrides: Partial<Parameters<typeof PostEntity.create>[0]> = {},
) {
  return PostEntity.create({
    userId: "user-1",
    source: "manual",
    title: "Shipping the payments rewrite",
    body: "We migrated the payments platform to event sourcing.",
    coverImageUrl: null,
    images: null,
    tags: ["payments", "kafka"],
    status: "published",
    externalUrl: null,
    metadata: null,
    publishedAt: new Date("2026-01-01"),
    ...overrides,
  });
}

const baseInput = () => ({
  resume: makeResume(),
  skills: [makeSkill("TypeScript")],
  titles: [makeTitle("Backend Engineer")],
  workExperiences: [
    makeWorkExperience({ mainStack: ["Go"], description: "Led platform team" }),
  ],
  posts: [makePost()],
});

describe("per-source resume documents", () => {
  it("keeps each source to its own content", () => {
    const input = baseInput();

    const profile = buildProfileSourceDocument(input);
    const work = buildWorkSourceDocument(input);
    const posts = buildPostsSourceDocument(input);

    expect(profile).toContain("skill: TypeScript");
    expect(profile).toContain("headline: Backend Engineer");
    expect(profile).not.toContain("experience:");
    expect(profile).not.toContain("post:");

    expect(work).toContain("experience: Staff Engineer at Globex");
    expect(work).not.toContain("skill:");
    expect(work).not.toContain("post:");

    expect(posts).toContain("post: Shipping the payments rewrite");
    expect(posts).toContain("post_tags: payments, kafka");
    expect(posts).not.toContain("skill:");
  });

  it("composes the blended document from exactly the same chunks", () => {
    const input = baseInput();
    const blended = buildWeightedResumeDocument(input);

    // The guarantee that scoped and unscoped search describe the same person:
    // every line of every source document appears verbatim in the blend.
    for (const document of [
      buildProfileSourceDocument(input),
      buildWorkSourceDocument(input),
      buildPostsSourceDocument(input),
    ]) {
      for (const line of document.split("\n")) {
        expect(blended, line).toContain(line);
      }
    }
  });

  it("omits a source the candidate has no content for", () => {
    const documents = buildResumeSourceDocuments({
      resume: makeResume(),
      skills: [],
      titles: [],
    });

    expect(documents.profile).toBeDefined();
    expect(documents.work).toBeUndefined();
    // An empty posts document would give every post-less candidate the same
    // vector, and they would all match any posts-scoped query equally.
    expect(documents.posts).toBeUndefined();
  });

  it("never embeds a draft post", () => {
    const documents = buildResumeSourceDocuments({
      resume: makeResume(),
      skills: [],
      titles: [],
      posts: [makePost({ status: "draft", title: "Unreleased feature" })],
    });

    expect(documents.posts).toBeUndefined();
  });

  it("bounds roles and truncates descriptions so the model never 400s", () => {
    const manyRoles = Array.from({ length: 30 }, (_, index) =>
      makeWorkExperience({
        title: `Role ${index}`,
        companyName: `Company ${index}`,
        description: "x".repeat(4_000),
        displayOrder: index,
      }),
    );

    const work = buildWorkSourceDocument({
      resume: makeResume(),
      skills: [],
      titles: [],
      workExperiences: manyRoles,
    });

    const roleLines = work
      .split("\n")
      .filter((line) => line.startsWith("experience: "));
    expect(roleLines).toHaveLength(
      RESUME_EMBEDDING_DOCUMENT_LIMITS.maxWorkExperiences,
    );

    for (const line of work.split("\n")) {
      if (line.startsWith("experience_detail: ")) {
        expect(line.length).toBeLessThanOrEqual(
          RESUME_EMBEDDING_DOCUMENT_LIMITS.workDescriptionChars + 40,
        );
      }
    }

    // 30 roles x 4 000 chars is ~15k tokens, which the embedding API rejects
    // outright — and the retry-then-die that follows leaves the candidate with
    // no vector and no way into any search (defect F27).
    expect(work.length).toBeLessThanOrEqual(
      RESUME_EMBEDDING_DOCUMENT_LIMITS.documentChars,
    );
  });

  it("bounds posts the same way", () => {
    const manyPosts = Array.from({ length: 50 }, (_, index) =>
      makePost({
        title: `Post ${index}`,
        body: "y".repeat(5_000),
        publishedAt: new Date(2026, 0, index + 1),
      }),
    );

    const posts = buildPostsSourceDocument({
      resume: makeResume(),
      skills: [],
      titles: [],
      posts: manyPosts,
    });

    const titles = posts.split("\n").filter((line) => line.startsWith("post: "));
    expect(titles).toHaveLength(RESUME_EMBEDDING_DOCUMENT_LIMITS.maxPosts);
    expect(posts.length).toBeLessThanOrEqual(
      RESUME_EMBEDDING_DOCUMENT_LIMITS.documentChars,
    );
    // Newest first, so the cap keeps what the candidate is working on now.
    expect(titles[0]).toContain("Post 49");
  });

  it("keeps the blended document bounded even with everything at once", () => {
    const blended = buildWeightedResumeDocument({
      resume: makeResume(),
      skills: Array.from({ length: 100 }, (_, index) =>
        makeSkill(`skill-${index}`, index),
      ),
      titles: [makeTitle("Backend Engineer")],
      workExperiences: Array.from({ length: 30 }, (_, index) =>
        makeWorkExperience({
          title: `Role ${index}`,
          description: "x".repeat(4_000),
          displayOrder: index,
        }),
      ),
      posts: Array.from({ length: 50 }, (_, index) =>
        makePost({ title: `Post ${index}`, body: "y".repeat(5_000) }),
      ),
    });

    expect(blended.length).toBeLessThanOrEqual(
      RESUME_EMBEDDING_DOCUMENT_LIMITS.documentChars,
    );
  });
});
