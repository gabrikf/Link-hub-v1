import { describe, expect, it } from "vitest";
import { searchTestEmbedder } from "../../use-case/resumes/search-testing/search-corpus.js";
import {
  IN_MEMORY_SUPPORTED_FILTERS,
  InMemoryResumeSearchRepository,
} from "./in-memory-resume-search-repository.js";
import { RecruiterSearchFilters } from "./resume-search-repository.js";

/**
 * A test double that silently ignores a filter is worse than no double at all:
 * it lets a test "prove" behaviour the real repository never had. The double
 * used to implement 9 of the 17 filters and pass everything for the other 8
 * (defect F23), so these tests exist to keep it honest.
 */

const QUERY = searchTestEmbedder.embed("engineer");

function seedOne(
  repository: InMemoryResumeSearchRepository,
  overrides: Partial<Parameters<InMemoryResumeSearchRepository["seed"]>[0]> & {
    resumeId: string;
  },
): void {
  repository.seed({
    userId: overrides.resumeId,
    email: `${overrides.resumeId}@example.com`,
    embedding: searchTestEmbedder.embed("engineer"),
    headlineTitle: "Engineer",
    summary: null,
    contractType: "pj",
    seniorityLevel: "senior",
    workModel: "remote",
    location: "Sao Paulo",
    noticePeriod: "Immediate",
    openToRelocation: false,
    totalYearsExperience: 5,
    salaryExpectationMin: null,
    salaryExpectationMax: null,
    spokenLanguages: ["English"],
    skills: [],
    titles: [],
    ...overrides,
  });
}

async function search(
  repository: InMemoryResumeSearchRepository,
  filters: RecruiterSearchFilters,
): Promise<string[]> {
  const results = await repository.searchByEmbedding({
    queryEmbedding: QUERY,
    topK: 50,
    filters,
  });
  return results.map((result) => result.resumeId);
}

describe("InMemoryResumeSearchRepository — filter conformance", () => {
  it("implements every key of RecruiterSearchFilters", () => {
    // The compile-time half of this guarantee is the `satisfies` clause on
    // IN_MEMORY_SUPPORTED_FILTERS; this is the runtime half, which catches a
    // key being *added* to the type without being added here.
    const declared: Array<keyof RecruiterSearchFilters> = [
      "contractTypes",
      "seniorityLevels",
      "workModels",
      "locations",
      "noticePeriods",
      "openToRelocation",
      "minYearsExperience",
      "maxYearsExperience",
      "spokenLanguages",
      "skills",
      "titles",
      "minSalary",
      "maxSalary",
      "nameContains",
      "usernameContains",
      "profileTextContains",
    ];

    expect([...IN_MEMORY_SUPPORTED_FILTERS].sort()).toEqual(declared.sort());
  });

  it("actually filters on every supported key", async () => {
    // The point of this table: every filter gets a candidate it must keep and
    // a candidate it must drop. A no-op filter fails immediately.
    const cases: Array<{
      filters: RecruiterSearchFilters;
      keep: Parameters<typeof seedOne>[1];
      drop: Parameters<typeof seedOne>[1];
    }> = [
      {
        filters: { contractTypes: ["clt"] },
        keep: { resumeId: "keep", contractType: "clt" },
        drop: { resumeId: "drop", contractType: "pj" },
      },
      {
        filters: { seniorityLevels: ["staff"] },
        keep: { resumeId: "keep", seniorityLevel: "staff" },
        drop: { resumeId: "drop", seniorityLevel: "junior" },
      },
      {
        filters: { workModels: ["hybrid"] },
        keep: { resumeId: "keep", workModel: "hybrid" },
        drop: { resumeId: "drop", workModel: "remote" },
      },
      {
        filters: { locations: ["Sao Paulo"] },
        keep: { resumeId: "keep", location: "Sao Paulo" },
        drop: { resumeId: "drop", location: "Rio de Janeiro" },
      },
      {
        filters: { noticePeriods: ["30 days"] },
        keep: { resumeId: "keep", noticePeriod: "30 days" },
        drop: { resumeId: "drop", noticePeriod: "Immediate" },
      },
      {
        filters: { openToRelocation: true },
        keep: { resumeId: "keep", openToRelocation: true },
        drop: { resumeId: "drop", openToRelocation: false },
      },
      {
        filters: { minYearsExperience: 8 },
        keep: { resumeId: "keep", totalYearsExperience: 10 },
        drop: { resumeId: "drop", totalYearsExperience: 3 },
      },
      {
        filters: { maxYearsExperience: 4 },
        keep: { resumeId: "keep", totalYearsExperience: 3 },
        drop: { resumeId: "drop", totalYearsExperience: 10 },
      },
      {
        filters: { spokenLanguages: ["Spanish"] },
        keep: { resumeId: "keep", spokenLanguages: ["Spanish"] },
        drop: { resumeId: "drop", spokenLanguages: ["German"] },
      },
      {
        filters: { skills: ["Rust"] },
        keep: { resumeId: "keep", skills: ["Rust", "Go"] },
        drop: { resumeId: "drop", skills: ["Go"] },
      },
      {
        filters: { titles: ["Architect"] },
        keep: { resumeId: "keep", titles: ["Solutions Architect"] },
        drop: { resumeId: "drop", titles: ["Engineer"] },
      },
      {
        filters: { minSalary: 200_000 },
        keep: { resumeId: "keep", salaryExpectationMax: 250_000 },
        drop: { resumeId: "drop", salaryExpectationMax: 100_000 },
      },
      {
        filters: { maxSalary: 100_000 },
        keep: { resumeId: "keep", salaryExpectationMin: 80_000 },
        drop: { resumeId: "drop", salaryExpectationMin: 300_000 },
      },
      {
        filters: { nameContains: "ana" },
        keep: { resumeId: "keep", name: "Ana Silva" },
        drop: { resumeId: "drop", name: "Bruno Costa" },
      },
      {
        filters: { usernameContains: "dev" },
        keep: { resumeId: "keep", username: "devana" },
        drop: { resumeId: "drop", username: "bruno" },
      },
      {
        filters: { profileTextContains: "payments" },
        keep: { resumeId: "keep", summary: "Worked on payments platforms" },
        drop: { resumeId: "drop", summary: "Worked on logistics" },
      },
    ];

    for (const testCase of cases) {
      const repository = new InMemoryResumeSearchRepository();
      seedOne(repository, testCase.keep);
      seedOne(repository, testCase.drop);

      const ids = await search(repository, testCase.filters);

      expect(ids, JSON.stringify(testCase.filters)).toEqual(["keep"]);
    }
  });

  it("matches locations, notice periods and languages accent-insensitively", async () => {
    const repository = new InMemoryResumeSearchRepository();
    seedOne(repository, {
      resumeId: "accented",
      location: "São Paulo",
      noticePeriod: "Imediato",
      spokenLanguages: ["Português"],
    });

    // The recruiter UI offers the unaccented spelling; the candidate typed the
    // accented one. Both sides fold to the same key (defect F8).
    expect(await search(repository, { locations: ["Sao Paulo"] })).toEqual([
      "accented",
    ]);
    expect(await search(repository, { locations: ["SÃO PAULO"] })).toEqual([
      "accented",
    ]);
    expect(await search(repository, { noticePeriods: ["imediato"] })).toEqual([
      "accented",
    ]);
    expect(
      await search(repository, { spokenLanguages: ["portugues"] }),
    ).toEqual(["accented"]);
  });

  it("treats a blank salary expectation as unstated, not as a mismatch", async () => {
    const repository = new InMemoryResumeSearchRepository();
    seedOne(repository, {
      resumeId: "no-salary",
      salaryExpectationMin: null,
      salaryExpectationMax: null,
    });
    seedOne(repository, {
      resumeId: "too-expensive",
      salaryExpectationMin: 400_000,
      salaryExpectationMax: 500_000,
    });

    // Both branches used to require the column IS NOT NULL, which silently
    // deleted every candidate who left salary blank — and most do (F12).
    expect(await search(repository, { maxSalary: 120_000 })).toEqual([
      "no-salary",
    ]);
    expect(await search(repository, { minSalary: 50_000 })).toEqual([
      "no-salary",
      "too-expensive",
    ]);
  });

  it("treats salary as a range overlap", async () => {
    const repository = new InMemoryResumeSearchRepository();
    seedOne(repository, {
      resumeId: "overlaps",
      salaryExpectationMin: 90_000,
      salaryExpectationMax: 140_000,
    });
    seedOne(repository, {
      resumeId: "above-band",
      salaryExpectationMin: 200_000,
      salaryExpectationMax: 260_000,
    });
    seedOne(repository, {
      resumeId: "below-band",
      salaryExpectationMin: 20_000,
      salaryExpectationMax: 40_000,
    });

    expect(
      await search(repository, { minSalary: 100_000, maxSalary: 150_000 }),
    ).toEqual(["overlaps"]);
  });

  it("hides candidates who are not open to work, from search and from reveal", async () => {
    const repository = new InMemoryResumeSearchRepository();
    seedOne(repository, { resumeId: "open" });
    seedOne(repository, { resumeId: "closed", openToWork: false });

    expect(await search(repository, {})).toEqual(["open"]);
    expect(await repository.findCandidateContact("closed")).toBeNull();
    expect(await repository.findCandidateContact("open")).toMatchObject({
      email: "open@example.com",
    });
  });

  it("never puts an email in a search result", async () => {
    const repository = new InMemoryResumeSearchRepository();
    seedOne(repository, { resumeId: "open" });

    const results = await repository.searchByEmbedding({
      queryEmbedding: QUERY,
      topK: 10,
      filters: {},
    });

    expect(results[0]?.email).toBeNull();
  });
});
