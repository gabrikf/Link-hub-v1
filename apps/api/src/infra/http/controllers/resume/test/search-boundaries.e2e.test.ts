/**
 * E2E tests for the things the in-memory double cannot possibly catch, because
 * they are properties of the SQL and of the ANN index rather than of the
 * repository contract:
 *
 *  1. PII — a search listing must not carry email addresses, and the reveal
 *     endpoint must be per-candidate and audited (defect F3).
 *  2. Accent folding — a candidate who typed `São Paulo` has to be found by a
 *     `Sao Paulo` filter, which only Postgres can answer (defect F8).
 *  3. Salary NULL semantics — an unstated expectation is not a mismatch
 *     (defect F12).
 *  4. ANN recall — how much of the exact top-K the ivfflat index actually
 *     returns once a selective filter is applied (defect F19). This is the one
 *     failure mode that is completely invisible without measuring: no error,
 *     no warning, just candidates that are never seen.
 *
 * Prerequisites: PostgreSQL with pgvector and the migrations applied. The suite
 * seeds and removes its own fixtures under a unique login prefix.
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mulberry32 } from "@repo/schemas";
import { DrizzleResumeSearchRepository } from "../../../../database/drizzle/repositories/resume-search.repository.js";
import { db } from "../../../../database/drizzle/index.js";
import {
  resumeEmbeddings,
  resumes,
  users,
} from "../../../../database/drizzle/schema.js";
import {
  resolveEmbeddingModel,
  resolveEmbeddingVersion,
} from "../../../../../core/use-case/resumes/shared/embedding-config.js";
import { RecruiterSearchFilters } from "../../../../../core/repositories/resume-search/resume-search-repository.js";
import { server } from "../../../server.js";

const PREFIX = `sbt${Date.now().toString(36)}`;
const EMBEDDING_DIMENSIONS = 1536;
const repository = new DrizzleResumeSearchRepository();

interface SeededRow {
  userId: string;
  resumeId: string;
  login: string;
  embedding: number[];
  location: string | null;
  noticePeriod: string | null;
  salaryExpectationMin: number | null;
  salaryExpectationMax: number | null;
  openToWork: boolean;
}

const seeded: SeededRow[] = [];

/** Deterministic unit vectors — a flaky recall number is a useless one. */
function randomUnitVector(random: () => number): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () =>
    // Box-Muller-free: uniform in [-1, 1] is plenty for a recall experiment.
    random() * 2 - 1,
  );
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return vector.map((value) => value / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
  }
  return dot;
}

async function insertCandidate(
  index: number,
  overrides: Partial<SeededRow> & { embedding: number[] },
): Promise<SeededRow> {
  const login = `${PREFIX}-${index}`;

  const [user] = await db
    .insert(users)
    .values({
      name: `Boundary ${index}`,
      login,
      email: `${login}@example.test`,
      password: "not-a-real-password-hash",
      openToWork: overrides.openToWork ?? true,
    })
    .returning({ id: users.id });

  const [resume] = await db
    .insert(resumes)
    .values({
      userId: user.id,
      headlineTitle: "Boundary Candidate",
      summary: "seeded by search-boundaries.e2e.test.ts",
      location: overrides.location ?? null,
      noticePeriod: overrides.noticePeriod ?? null,
      salaryExpectationMin: overrides.salaryExpectationMin ?? null,
      salaryExpectationMax: overrides.salaryExpectationMax ?? null,
      spokenLanguages: overrides.location === "São Paulo" ? ["Português"] : [],
    })
    .returning({ id: resumes.id });

  await db.insert(resumeEmbeddings).values({
    resumeId: resume.id,
    userId: user.id,
    embedding: overrides.embedding,
    contentHash: `${login}-hash`,
    embeddingModel: resolveEmbeddingModel(),
    embeddingVersion: resolveEmbeddingVersion(),
  });

  const row: SeededRow = {
    userId: user.id,
    resumeId: resume.id,
    login,
    embedding: overrides.embedding,
    location: overrides.location ?? null,
    noticePeriod: overrides.noticePeriod ?? null,
    salaryExpectationMin: overrides.salaryExpectationMin ?? null,
    salaryExpectationMax: overrides.salaryExpectationMax ?? null,
    openToWork: overrides.openToWork ?? true,
  };

  seeded.push(row);
  return row;
}

/**
 * Exact, brute-force ground truth computed in JavaScript rather than in SQL.
 *
 * Deliberately not a second SQL query: if the reference implementation shared
 * the repository's predicates, a bug in those predicates would cancel out and
 * the recall number would look perfect.
 */
function exactTopK(
  queryEmbedding: number[],
  predicate: (row: SeededRow) => boolean,
  k: number,
): string[] {
  return seeded
    .filter((row) => row.openToWork && predicate(row))
    .map((row) => ({
      id: row.resumeId,
      score: cosine(row.embedding, queryEmbedding),
    }))
    .sort((a, b) => (b.score === a.score ? a.id.localeCompare(b.id) : b.score - a.score))
    .slice(0, k)
    .map((row) => row.id);
}

async function annTopK(
  queryEmbedding: number[],
  filters: RecruiterSearchFilters,
  k: number,
): Promise<string[]> {
  const results = await repository.searchByEmbedding({
    queryEmbedding,
    topK: k,
    filters,
  });
  return results.map((result) => result.resumeId);
}

function recall(ann: string[], exact: string[]): number {
  // Throwing, not returning 1. An empty expected set means the fixture failed to
  // seed anything the filter matches, and calling that "perfect recall" is how a
  // recall test quietly stops testing recall.
  if (exact.length === 0) {
    throw new Error(
      "recall() got an empty expected set — the fixture matched no candidates, so this assertion would pass vacuously",
    );
  }
  const found = new Set(ann);
  return exact.filter((id) => found.has(id)).length / exact.length;
}

/** Buckets that give a filter a known selectivity over the seeded set. */
const BUCKET_ALL = "boundary-all";
const BUCKET_TENTH = "boundary-tenth";
const BUCKET_HUNDREDTH = "boundary-hundredth";

const RECALL_SET_SIZE = 300;
let recallQuery: number[] = [];

describe("recruiter search — SQL boundaries", () => {
  beforeAll(async () => {
    await server.ready();

    const random = mulberry32(20260801);
    recallQuery = randomUnitVector(random);

    // A population large enough that ivfflat's default 10-of-100 probes really
    // does miss things when a filter narrows the set.
    for (let index = 0; index < RECALL_SET_SIZE; index += 1) {
      let noticePeriod = BUCKET_ALL;
      if (index % 100 === 0) {
        noticePeriod = BUCKET_HUNDREDTH;
      } else if (index % 10 === 0) {
        noticePeriod = BUCKET_TENTH;
      }

      await insertCandidate(index, {
        embedding: randomUnitVector(random),
        noticePeriod,
        location: "Remote",
      });
    }

    // Fixtures for the non-recall assertions.
    await insertCandidate(9001, {
      embedding: randomUnitVector(random),
      location: "São Paulo",
      noticePeriod: "Imediato",
    });
    await insertCandidate(9002, {
      embedding: randomUnitVector(random),
      location: "Remote",
      salaryExpectationMin: null,
      salaryExpectationMax: null,
    });
    // A closed candidate and an OPEN twin sharing one vector. The twin is the
    // control: querying with that vector must return the twin and must not
    // return the closed one. Without it, "the closed candidate is absent" would
    // also hold when the query legitimately matches nothing, and the
    // authorization assertion would pass for the wrong reason.
    const gatedVector = randomUnitVector(random);
    await insertCandidate(9003, {
      embedding: gatedVector,
      location: "Remote",
      openToWork: false,
    });
    await insertCandidate(9004, {
      embedding: gatedVector,
      location: "Remote",
      openToWork: true,
    });
  }, 180_000);

  afterAll(async () => {
    // Cascades to resumes and resume_embeddings.
    await db.execute(sql`DELETE FROM users WHERE login LIKE ${`${PREFIX}-%`}`);
  });

  // -------------------------------------------------------------------------
  // Accent folding (F8)
  // -------------------------------------------------------------------------

  it("finds a candidate who typed São Paulo when the filter says Sao Paulo", async () => {
    const accented = seeded.find((row) => row.location === "São Paulo")!;

    const found = await annTopK(
      accented.embedding,
      { usernameContains: PREFIX, locations: ["Sao Paulo"] },
      50,
    );

    // The recruiter UI offers the unaccented spelling from a fixed list; the
    // candidate typed their city the way it is actually spelled.
    expect(found).toContain(accented.resumeId);
  });

  it("matches notice periods and languages accent- and case-insensitively", async () => {
    const accented = seeded.find((row) => row.location === "São Paulo")!;

    const byNotice = await annTopK(
      accented.embedding,
      { usernameContains: PREFIX, noticePeriods: ["IMEDIATO"] },
      50,
    );
    const byLanguage = await annTopK(
      accented.embedding,
      { usernameContains: PREFIX, spokenLanguages: ["portugues"] },
      50,
    );

    expect(byNotice).toContain(accented.resumeId);
    expect(byLanguage).toContain(accented.resumeId);
  });

  // -------------------------------------------------------------------------
  // Salary NULL semantics (F12)
  // -------------------------------------------------------------------------

  it("returns a candidate with no salary expectation when only minSalary is set", async () => {
    const blank = seeded.find(
      (row) =>
        row.salaryExpectationMin === null &&
        row.salaryExpectationMax === null &&
        row.location === "Remote",
    )!;

    const withMin = await annTopK(
      blank.embedding,
      { usernameContains: PREFIX, minSalary: 120_000 },
      50,
    );
    const withMax = await annTopK(
      blank.embedding,
      { usernameContains: PREFIX, maxSalary: 120_000 },
      50,
    );

    // Both branches used to require the column IS NOT NULL, which silently
    // deleted every candidate who left salary blank — and most do.
    expect(withMin).toContain(blank.resumeId);
    expect(withMax).toContain(blank.resumeId);
  });

  // -------------------------------------------------------------------------
  // Authorization boundary (F3)
  // -------------------------------------------------------------------------

  it("never returns a candidate who is not open to work", async () => {
    const closed = seeded.find((row) => !row.openToWork)!;

    // Querying with the closed candidate's OWN vector: they are the nearest
    // possible match (cosine 1.0), so if the gate leaks they come back first.
    // Two random 1536-d vectors sit at cosine ≈ 0, which is under the default
    // similarity floor — so a random query returns nothing and `not.toContain`
    // would pass without proving anything.
    const found = await annTopK(
      closed.embedding,
      { usernameContains: PREFIX },
      100,
    );

    expect(found).not.toContain(closed.resumeId);
    // The open candidate seeded with the same vector must still come back,
    // otherwise the assertion above is vacuous.
    expect(found.length).toBeGreaterThan(0);
    expect(await repository.findCandidateContact(closed.resumeId)).toBeNull();
  });

  it("does not put an email in any search result", async () => {
    const anyOpen = seeded.find((row) => row.openToWork)!;

    const results = await repository.searchByEmbedding({
      queryEmbedding: anyOpen.embedding,
      topK: 25,
      filters: { usernameContains: PREFIX },
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((result) => result.email === null)).toBe(true);
  });

  it("exposes an email only through the per-candidate reveal endpoint", async () => {
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "recruiter.seed@crafthub.local",
        password: "12345678",
      }),
    });
    expect(login.statusCode).toBe(200);
    const token = login.json<{ accessToken: string }>().accessToken;

    const open = seeded.find((row) => row.openToWork)!;

    const search = await server.inject({
      method: "POST",
      url: "/resumes/search",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        chatPrompt: "boundary candidate",
        topK: 5,
      }),
    });
    expect(search.statusCode).toBe(200);
    for (const candidate of search.json<{
      candidates: Array<{ email: string | null }>;
    }>().candidates) {
      expect(candidate.email).toBeNull();
    }

    const reveal = await server.inject({
      method: "POST",
      url: `/resumes/${open.resumeId}/contact`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ queryText: "boundary candidate" }),
    });

    expect(reveal.statusCode).toBe(200);
    expect(reveal.json<{ email: string }>().email).toBe(
      `${open.login}@example.test`,
    );

    // Unauthenticated callers get nothing at all.
    const anonymous = await server.inject({
      method: "POST",
      url: `/resumes/${open.resumeId}/contact`,
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it("refuses to reveal a candidate who is not open to work", async () => {
    const login = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "recruiter.seed@crafthub.local",
        password: "12345678",
      }),
    });
    const token = login.json<{ accessToken: string }>().accessToken;
    const closed = seeded.find((row) => !row.openToWork)!;

    const reveal = await server.inject({
      method: "POST",
      url: `/resumes/${closed.resumeId}/contact`,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: "{}",
    });

    expect(reveal.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // ANN recall under selective filters (F19)
  // -------------------------------------------------------------------------

  describe("ANN recall against brute force", () => {
    const K = 20;
    const GATE = 0.95;

    const cases = [
      {
        name: "no filter (100% selectivity)",
        filters: { usernameContains: PREFIX } satisfies RecruiterSearchFilters,
        predicate: () => true,
      },
      {
        name: "10% of the population",
        filters: {
          usernameContains: PREFIX,
          noticePeriods: [BUCKET_TENTH],
        } satisfies RecruiterSearchFilters,
        predicate: (row: SeededRow) => row.noticePeriod === BUCKET_TENTH,
      },
      {
        name: "1% of the population",
        filters: {
          usernameContains: PREFIX,
          noticePeriods: [BUCKET_HUNDREDTH],
        } satisfies RecruiterSearchFilters,
        predicate: (row: SeededRow) => row.noticePeriod === BUCKET_HUNDREDTH,
      },
    ];

    for (const testCase of cases) {
      it(`recalls at least ${GATE * 100}% of the exact top-${K} — ${testCase.name}`, async () => {
        // Random unit vectors are near-orthogonal to everything, so the default
        // similarity floor would empty the result set before recall could be
        // measured. The floor is not what is under test here.
        const previousFloor = process.env.SEARCH_MIN_SIMILARITY;
        process.env.SEARCH_MIN_SIMILARITY = "0";

        try {
          const exact = exactTopK(recallQuery, testCase.predicate, K);
          const ann = await annTopK(recallQuery, testCase.filters, K);

          expect(exact.length).toBeGreaterThan(0);
          // The failure this guards against is silent: ivfflat probes ~10% of
          // the clusters and applies the filter afterwards, so with a selective
          // filter most matching candidates are never visited and simply never
          // appear. No error, no warning, just missing people.
          expect(
            recall(ann, exact),
            `recall for ${testCase.name}: got [${ann.length}] vs exact [${exact.length}]`,
          ).toBeGreaterThanOrEqual(GATE);
        } finally {
          if (previousFloor === undefined) {
            delete process.env.SEARCH_MIN_SIMILARITY;
          } else {
            process.env.SEARCH_MIN_SIMILARITY = previousFloor;
          }
        }
      });
    }

    it("returns a full page rather than letting the similarity floor become the page size", async () => {
      // `SEARCH_MIN_SIMILARITY` used to be applied in JavaScript after
      // `LIMIT topK`, so a topK=50 request could come back with 3 results even
      // though 50 candidates matched (defect F19).
      const previousFloor = process.env.SEARCH_MIN_SIMILARITY;
      process.env.SEARCH_MIN_SIMILARITY = "0";

      try {
        const results = await repository.searchByEmbedding({
          queryEmbedding: recallQuery,
          topK: 50,
          filters: { usernameContains: PREFIX },
        });

        expect(results).toHaveLength(50);
      } finally {
        if (previousFloor === undefined) {
          delete process.env.SEARCH_MIN_SIMILARITY;
        } else {
          process.env.SEARCH_MIN_SIMILARITY = previousFloor;
        }
      }
    });

    it("survives a non-numeric IVFFLAT_PROBES instead of 500ing every search", async () => {
      // `SET LOCAL ivfflat.probes = NaN` aborts the transaction, which turns
      // every single search into a 500 until someone spots the typo (F20).
      const previous = process.env.IVFFLAT_PROBES;
      process.env.IVFFLAT_PROBES = "abc";

      try {
        const results = await repository.searchByEmbedding({
          queryEmbedding: recallQuery,
          topK: 5,
          filters: { usernameContains: PREFIX },
        });

        expect(Array.isArray(results)).toBe(true);
      } finally {
        if (previous === undefined) {
          delete process.env.IVFFLAT_PROBES;
        } else {
          process.env.IVFFLAT_PROBES = previous;
        }
      }
    });

    it("returns identical results for identical requests", async () => {
      const first = await annTopK(recallQuery, { usernameContains: PREFIX }, 30);
      const second = await annTopK(
        recallQuery,
        { usernameContains: PREFIX },
        30,
      );

      // A total order (`score DESC, id ASC`) is what makes this true; without
      // the id tie-break the same search shows a different page each time.
      expect(second).toEqual(first);
    });
  });
});
