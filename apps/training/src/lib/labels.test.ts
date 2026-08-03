import { describe, expect, it } from "vitest";
import {
  aggregateInteractions,
  buildLabel,
  buildTrainingRows,
  resolveLabel,
} from "./labels.js";
import type {
  CandidateTrainingProfile,
  InteractionTrainingRow,
} from "./training-types.js";

function interaction(
  overrides: Partial<InteractionTrainingRow> = {},
): InteractionTrainingRow {
  return {
    resumeId: "resume-1",
    interactionType: "EMAIL_COPY",
    queryText: "React engineer",
    querySnapshot: null,
    candidateSnapshot: null,
    displayedRank: null,
    resultCount: null,
    searchSessionId: null,
    propensity: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function profile(
  overrides: Partial<CandidateTrainingProfile> = {},
): CandidateTrainingProfile {
  return {
    resumeId: "resume-1",
    headlineTitle: "Engineer",
    summary: "Builds things",
    totalYearsExperience: 5,
    seniorityLevel: "mid",
    workModel: "remote",
    contractType: "full-time",
    location: "sao paulo",
    spokenLanguages: ["english"],
    noticePeriod: "30 days",
    openToRelocation: true,
    salaryExpectationMin: 100000,
    salaryExpectationMax: 150000,
    skills: ["React"],
    titles: ["Frontend Engineer"],
    workExperiences: [],
    posts: [],
    ...overrides,
  };
}

describe("F1 — interaction score is independent of profile size", () => {
  it("gives the same score to a 1-skill and a 10-skill candidate with one email copy", () => {
    // The old SQL joined resume_skills and resume_titles alongside
    // candidate_interactions and then summed the interaction weights, so the
    // score was multiplied by `#skills × #titles`. Ten skills and three titles
    // turned one email copy into 30 — a saturated label 1.0 that encoded
    // nothing but how many chips the candidate had filled in.
    const interactions = [
      interaction({ resumeId: "thin" }),
      interaction({ resumeId: "chunky" }),
    ];

    const aggregates = aggregateInteractions(interactions);
    const thin = aggregates.find((a) => a.resumeId === "thin")!;
    const chunky = aggregates.find((a) => a.resumeId === "chunky")!;

    expect(thin.interactionScore).toBe(1);
    expect(chunky.interactionScore).toBe(1);

    const rows = buildTrainingRows(
      aggregates,
      new Map([
        ["thin", profile({ resumeId: "thin", skills: ["React"], titles: ["FE"] })],
        [
          "chunky",
          profile({
            resumeId: "chunky",
            skills: Array.from({ length: 10 }, (_, i) => `skill-${i}`),
            titles: ["A", "B", "C"],
          }),
        ],
      ]),
    );

    const labels = rows.map(resolveLabel);
    expect(new Set(labels).size).toBe(1);
    expect(labels[0]).toBe(0.5);
  });

  it("sums repeated interactions once each, not once per profile attribute", () => {
    const aggregates = aggregateInteractions([
      interaction({ interactionType: "EMAIL_COPY" }),
      interaction({ interactionType: "PROFILE_VIEW" }),
    ]);

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]!.interactionScore).toBeCloseTo(1.35, 10);
  });
});

describe("F17 — one training row per (query, candidate)", () => {
  it("does not merge two different searches for the same candidate", () => {
    // Interactions used to be summed across every recruiter and every query and
    // paired with `MAX(query_text)`, so a candidate emailed from a Rust search
    // and a React search became one row claiming a React profile perfectly
    // matches a Rust query.
    const aggregates = aggregateInteractions([
      interaction({ queryText: "Rust engineer" }),
      interaction({ queryText: "React engineer" }),
    ]);

    expect(aggregates).toHaveLength(2);
    expect(aggregates.map((a) => a.queryText).sort()).toEqual([
      "React engineer",
      "Rust engineer",
    ]);
    expect(aggregates.every((a) => a.interactionScore === 1)).toBe(true);
  });

  it("treats trivially different spellings of one query as the same example", () => {
    const aggregates = aggregateInteractions([
      interaction({ queryText: "React Engineer" }),
      interaction({ queryText: "  react   engineer " }),
    ]);

    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]!.interactionScore).toBe(2);
  });
});

describe("F5 — NOT_RELEVANT is a negative signal, and it survives", () => {
  it("produces a present row with label 0 for a rejection-only candidate", () => {
    // Three separate bugs used to swallow this: the SQL `CASE` had no branch
    // for it, `HAVING SUM(...) > 0` dropped any resume whose only signal was
    // negative, and incremental mode summed it with the positives so five
    // rejections made a candidate look better.
    const aggregates = aggregateInteractions([
      interaction({ interactionType: "NOT_RELEVANT" }),
    ]);

    const rows = buildTrainingRows(
      aggregates,
      new Map([["resume-1", profile()]]),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.interactionScore).toBe(-1);
    expect(resolveLabel(rows[0]!)).toBe(0);
  });

  it("lets a rejection cancel a weak positive instead of adding to it", () => {
    const aggregates = aggregateInteractions([
      interaction({ interactionType: "PROFILE_VIEW" }),
      interaction({ interactionType: "NOT_RELEVANT" }),
    ]);

    expect(aggregates[0]!.interactionScore).toBeCloseTo(-0.65, 10);
    expect(buildLabel(aggregates[0]!.interactionScore)).toBe(0);
  });

  it("does not let repeated rejections raise the score", () => {
    const many = aggregateInteractions(
      Array.from({ length: 5 }, () =>
        interaction({ interactionType: "NOT_RELEVANT" }),
      ),
    );
    const one = aggregateInteractions([
      interaction({ interactionType: "NOT_RELEVANT" }),
    ]);

    expect(many[0]!.interactionScore).toBeLessThan(one[0]!.interactionScore);
  });
});

describe("buildTrainingRows", () => {
  it("falls back to the frozen candidate snapshot when the profile is gone", () => {
    const aggregates = aggregateInteractions([
      interaction({
        resumeId: "deleted",
        candidateSnapshot: {
          headlineTitle: "Ex Candidate",
          skills: ["Elixir"],
          titles: ["Backend Engineer"],
        },
      }),
    ]);

    const rows = buildTrainingRows(aggregates, new Map());

    expect(rows).toHaveLength(1);
    expect(rows[0]!.headlineTitle).toBe("Ex Candidate");
    expect(rows[0]!.skills).toEqual(["Elixir"]);
  });

  it("drops a row that has neither a profile nor a snapshot", () => {
    const aggregates = aggregateInteractions([
      interaction({ resumeId: "ghost" }),
    ]);

    expect(buildTrainingRows(aggregates, new Map())).toHaveLength(0);
  });

  it("prefers the query snapshot's semantic query over the raw query text", () => {
    const aggregates = aggregateInteractions([
      interaction({
        queryText: "raw text",
        querySnapshot: { semanticQuery: "Role: Fullstack Engineer" },
      }),
    ]);

    const rows = buildTrainingRows(
      aggregates,
      new Map([["resume-1", profile()]]),
    );

    expect(rows[0]!.queryText).toBe("Role: Fullstack Engineer");
  });

  it("keeps the best rank seen and the latest observation time", () => {
    const aggregates = aggregateInteractions([
      interaction({
        displayedRank: 12,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      }),
      interaction({
        displayedRank: 3,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      }),
    ]);

    expect(aggregates[0]!.displayedRank).toBe(3);
    expect(aggregates[0]!.observedAt.toISOString()).toBe(
      "2026-01-02T00:00:00.000Z",
    );
  });
});

describe("buildLabel", () => {
  it("saturates at 1 and floors at 0", () => {
    expect(buildLabel(-5)).toBe(0);
    expect(buildLabel(0)).toBe(0);
    expect(buildLabel(1)).toBe(0.5);
    expect(buildLabel(2)).toBe(1);
    expect(buildLabel(50)).toBe(1);
  });
});
