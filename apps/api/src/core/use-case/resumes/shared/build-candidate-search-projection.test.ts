import { RECRUITER_SEARCH_EVIDENCE_LIMITS } from "@repo/schemas";
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_SEARCH_FETCH_LIMITS,
  CandidatePostRow,
  CandidateWorkExperienceRow,
  toRecruiterWorkExperiences,
  toWorkEvidence,
  truncateText,
} from "./build-candidate-search-projection.js";

function makeExperience(
  overrides: Partial<CandidateWorkExperienceRow> = {},
): Partial<CandidateWorkExperienceRow> {
  return {
    title: "Backend Engineer",
    companyName: "Acme",
    description: "Built the billing pipeline",
    mainStack: ["Node.js", "PostgreSQL"],
    startDate: "2021-01-01",
    endDate: "2023-06-01",
    isCurrent: false,
    employmentType: "full-time",
    workModel: "remote",
    ...overrides,
  };
}

function makePost(overrides: Partial<CandidatePostRow> = {}): CandidatePostRow {
  return {
    id: "post-1",
    title: "Shipped rate limiting",
    body: "Added a token-bucket rate limiter to the public API",
    source: "manual",
    tags: ["api"],
    externalUrl: null,
    publishedAt: "2024-03-02T10:00:00.000Z",
    ...overrides,
  };
}

describe("truncateText", () => {
  it("returns normalized text untouched when under the cap", () => {
    expect(truncateText("  hello   world ", 50)).toBe("hello world");
  });

  it("clips on a word boundary and marks the cut", () => {
    const result = truncateText("alpha beta gamma delta epsilon", 20);

    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);
    expect(result).not.toContain("epsilon");
  });

  it("treats null and undefined as empty", () => {
    expect(truncateText(null, 10)).toBe("");
    expect(truncateText(undefined, 10)).toBe("");
  });
});

describe("toRecruiterWorkExperiences", () => {
  it("carries the dates, tenure flag and role metadata a recruiter needs", () => {
    const [experience] = toRecruiterWorkExperiences([
      makeExperience({ isCurrent: true, endDate: null }),
    ]);

    expect(experience).toMatchObject({
      title: "Backend Engineer",
      companyName: "Acme",
      startDate: "2021-01-01",
      endDate: null,
      isCurrent: true,
      employmentType: "full-time",
      workModel: "remote",
      mainStack: ["Node.js", "PostgreSQL"],
    });
  });

  it("truncates long descriptions to the documented cap", () => {
    const [experience] = toRecruiterWorkExperiences([
      makeExperience({ description: "word ".repeat(1000) }),
    ]);

    expect(experience?.description?.length).toBeLessThanOrEqual(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.workDescriptionChars + 1,
    );
  });

  it("keeps a description that fits verbatim rather than cutting it short", () => {
    const description = "Owned the checkout service end to end.";
    const [experience] = toRecruiterWorkExperiences([
      makeExperience({ description }),
    ]);

    expect(experience?.description).toBe(description);
  });

  it("caps how many roles a single candidate contributes", () => {
    const rows = Array.from({ length: 30 }, () => makeExperience());

    expect(toRecruiterWorkExperiences(rows)).toHaveLength(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.maxWorkExperiences,
    );
  });

  it("defaults missing NOT NULL columns rather than emitting nulls", () => {
    const [experience] = toRecruiterWorkExperiences([
      { title: null, companyName: null, mainStack: null, isCurrent: null },
    ]);

    expect(experience).toMatchObject({
      title: "",
      companyName: "",
      mainStack: [],
      isCurrent: false,
      description: null,
    });
  });
});

describe("toWorkEvidence", () => {
  it("projects a post to an excerpt and never the full body", () => {
    const body = "x".repeat(5000);
    const [evidence] = toWorkEvidence([makePost({ body })]);

    expect(evidence?.excerpt.length).toBeLessThanOrEqual(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.postExcerptChars + 1,
    );
    expect(evidence?.excerpt).not.toBe(body);
  });

  it("puts commit-sourced posts first — they are the real proof of work", () => {
    const evidence = toWorkEvidence([
      makePost({ id: "manual-1", source: "manual" }),
      makePost({ id: "commit-1", source: "commit" }),
      makePost({ id: "manual-2", source: "manual" }),
    ]);

    expect(evidence[0]?.id).toBe("commit-1");
  });

  it("caps the number of posts per candidate", () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      makePost({ id: `post-${index}` }),
    );

    expect(toWorkEvidence(rows)).toHaveLength(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.maxPostsPerCandidate,
    );
  });

  it("parses publishedAt and tolerates a missing one", () => {
    const [dated] = toWorkEvidence([makePost()]);
    const [undatedDraftLike] = toWorkEvidence([
      makePost({ publishedAt: null }),
    ]);

    expect(dated?.publishedAt).toBeInstanceOf(Date);
    expect(undatedDraftLike?.publishedAt).toBeNull();
  });

  it("normalizes a missing tags array to an empty list", () => {
    const [evidence] = toWorkEvidence([makePost({ tags: null })]);

    expect(evidence?.tags).toEqual([]);
  });

  it("passes through an http(s) external link", () => {
    const [evidence] = toWorkEvidence([
      makePost({ externalUrl: "https://example.com/commit" }),
    ]);

    expect(evidence?.externalUrl).toBe("https://example.com/commit");
  });

  it("drops a non-http external link rather than rendering it as an href", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
    ]) {
      const [evidence] = toWorkEvidence([makePost({ externalUrl: url })]);
      expect(evidence?.externalUrl).toBeNull();
    }
  });
});

describe("CANDIDATE_SEARCH_FETCH_LIMITS", () => {
  it("fetches more posts than it shows, so commit posts can be promoted", () => {
    // `toWorkEvidence` reorders commit-sourced posts ahead of manual ones and
    // then cuts. If SQL only fetched what the card displays there would be
    // nothing to promote, and "best evidence" would quietly become "most
    // recent" without a single test failing.
    expect(CANDIDATE_SEARCH_FETCH_LIMITS.maxPosts).toBeGreaterThan(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.maxPostsPerCandidate,
    );
  });

  it("pulls at least as much text as the excerpt will keep", () => {
    expect(CANDIDATE_SEARCH_FETCH_LIMITS.postBodyChars).toBeGreaterThanOrEqual(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.postExcerptChars,
    );
    expect(
      CANDIDATE_SEARCH_FETCH_LIMITS.workDescriptionChars,
    ).toBeGreaterThanOrEqual(
      RECRUITER_SEARCH_EVIDENCE_LIMITS.workDescriptionChars,
    );
  });
});
