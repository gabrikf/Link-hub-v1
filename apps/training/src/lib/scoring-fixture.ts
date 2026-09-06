import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CandidateFeaturesInput, PostFeature } from "@repo/schemas";
import { SYNTHETIC_STACKS } from "./blueprints.js";
import { pickCyclic } from "./cyclic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, "../../../../");
export const modelsDir = path.join(rootDir, "apps/web/public/ai-models");
export const fixturePath = path.join(
  rootDir,
  "apps/training/src/fixtures/frozen-scoring.json",
);

/** Pinned so post recency — a real feature — cannot drift the fixture daily. */
export const FIXTURE_NOW = Date.UTC(2026, 6, 1);

export interface FixtureCase {
  id: string;
  queryText: string;
  candidate: CandidateFeaturesInput;
}

function daysAgo(days: number): string {
  return new Date(FIXTURE_NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

function postsFor(
  tags: readonly string[],
  count: number,
  commitCount: number,
  ageDays: number,
): PostFeature[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Working with ${tags[index % tags.length]}`,
    excerpt: `Notes on ${tags.join(", ")} and what we learned shipping it.`,
    source: index < commitCount ? "commit" : "manual",
    tags: [...tags],
    publishedAt: daysAgo(ageDays + index * 30),
  }));
}

/**
 * The frozen scoring corpus: 51 deterministic (query, candidate) pairs spanning
 * every blueprint, four quality tiers, and the edge cases that historically
 * moved silently — empty profiles, work history without declared skills, posts
 * without work history.
 *
 * Deliberately built from data, not from the model: nothing here reads a
 * prediction, so regenerating the fixture cannot quietly redefine what is being
 * measured.
 */
export function buildFixtureCases(): FixtureCase[] {
  const cases: FixtureCase[] = [];

  for (const [index, blueprint] of SYNTHETIC_STACKS.entries()) {
    const query = [
      `Role: ${blueprint.titles[0] ?? blueprint.headline}`,
      `Seniority: ${blueprint.seniorityLevel}`,
      `Core Skills: ${blueprint.skills.join(", ")}`,
      `Titles: ${blueprint.titles.join(", ")}`,
      `Work Model: ${blueprint.workModel}`,
      `Experience: ${blueprint.minYears}+ years`,
    ].join("\n");

    const base: CandidateFeaturesInput = {
      headlineTitle: blueprint.headline,
      summary: blueprint.summary,
      totalYearsExperience: blueprint.minYears + 1,
      seniorityLevel: blueprint.seniorityLevel,
      workModel: blueprint.workModel,
      contractType: blueprint.contractType,
      location: blueprint.location,
      spokenLanguages: [...blueprint.spokenLanguages],
      noticePeriod: blueprint.noticePeriod,
      openToRelocation: blueprint.openToRelocation,
      salaryExpectationMin: blueprint.salaryExpectationMin,
      salaryExpectationMax: blueprint.salaryExpectationMax,
      skills: [...blueprint.skills],
      titles: [...blueprint.titles],
      workExperiences: [
        {
          title: blueprint.titles[0] ?? blueprint.headline,
          companyName: "Nubank",
          description: `Shipped features with ${blueprint.skills.join(", ")}.`,
          mainStack: [...blueprint.skills],
        },
      ],
      posts: postsFor(blueprint.postTags, 2, 1, 30),
    };

    // Strong: everything, with evidence.
    cases.push({ id: `${index}-strong`, queryText: query, candidate: base });

    // Partial: half the stack, no posts, no work history.
    cases.push({
      id: `${index}-partial`,
      queryText: query,
      candidate: {
        ...base,
        skills: blueprint.skills.slice(
          0,
          Math.max(1, Math.floor(blueprint.skills.length / 2)),
        ),
        titles: blueprint.titles.slice(0, 1),
        workExperiences: [],
        posts: [],
      },
    });

    // Mismatch: the candidate from the opposite half of the blueprint list.
    const other = pickCyclic(
      SYNTHETIC_STACKS,
      index + Math.floor(SYNTHETIC_STACKS.length / 2),
    );
    cases.push({
      id: `${index}-mismatch`,
      queryText: query,
      candidate: {
        ...base,
        headlineTitle: other.headline,
        summary: other.summary,
        skills: [...other.skills],
        titles: [...other.titles],
        workExperiences: [
          {
            title: other.titles[0] ?? other.headline,
            companyName: "VTEX",
            description: `Shipped features with ${other.skills.join(", ")}.`,
            mainStack: [...other.skills],
          },
        ],
        posts: postsFor(other.postTags, 2, 2, 15),
      },
    });
  }

  // Edge cases that never moved a metric but move a score.
  const emptyQuery = "Role: Fullstack Engineer\nCore Skills: React, Node.js";

  cases.push({
    id: "edge-empty-profile",
    queryText: emptyQuery,
    candidate: {
      headlineTitle: null,
      summary: null,
      totalYearsExperience: null,
      seniorityLevel: null,
      workModel: null,
      contractType: null,
      location: null,
      spokenLanguages: [],
      noticePeriod: null,
      openToRelocation: false,
      salaryExpectationMin: null,
      salaryExpectationMax: null,
      skills: [],
      titles: [],
      workExperiences: [],
      posts: [],
    },
  });

  cases.push({
    id: "edge-history-without-declared-skills",
    queryText: emptyQuery,
    candidate: {
      headlineTitle: "Engineer",
      summary: null,
      totalYearsExperience: 7,
      seniorityLevel: "senior",
      workModel: "remote",
      contractType: "full-time",
      location: "sao paulo",
      spokenLanguages: ["english"],
      noticePeriod: "30 days",
      openToRelocation: true,
      salaryExpectationMin: 120000,
      salaryExpectationMax: 180000,
      skills: [],
      titles: [],
      workExperiences: [
        {
          title: "Fullstack Engineer",
          companyName: "Stone",
          description: "Built React frontends on a Node.js API.",
          mainStack: ["React", "Node.js"],
        },
      ],
      posts: [],
    },
  });

  cases.push({
    id: "edge-posts-without-history",
    queryText: emptyQuery,
    candidate: {
      headlineTitle: "Indie developer",
      summary: "Ships side projects",
      totalYearsExperience: 3,
      seniorityLevel: "mid",
      workModel: "remote",
      contractType: "freelance",
      location: "recife",
      spokenLanguages: ["portuguese"],
      noticePeriod: "immediate",
      openToRelocation: false,
      salaryExpectationMin: 60000,
      salaryExpectationMax: 90000,
      skills: ["React", "Node.js"],
      titles: [],
      workExperiences: [],
      posts: postsFor(["react", "node.js"], 3, 3, 10),
    },
  });

  return cases;
}
