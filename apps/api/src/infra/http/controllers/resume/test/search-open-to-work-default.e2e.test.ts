/**
 * The reported bug, against real Postgres.
 *
 * A recruiter searched plain text, a matching developer existed, and the API
 * answered 200 with an empty `candidates` array. `users.open_to_work` defaulted
 * to FALSE, so an account was born undiscoverable and nothing said so.
 *
 * Four claims are proved here, and only Postgres can answer any of them:
 *
 *  1. Registration through the real route persists `open_to_work = true`. The
 *     entity default is not enough on its own — an insert that writes an
 *     explicit `false` would undo it silently, which is the exact shape of a
 *     "fix" that ships and changes nothing.
 *  2. A search finds the candidate when they are the ONLY one in scope. The
 *     product requirement is that it works with a single registered developer.
 *  3. The gate still works. Changing the DEFAULT must not turn "I am not
 *     looking right now" into a setting that does nothing.
 *  4. A zero-result search says WHY in the log, distinguishing the open-to-work
 *     gate from a stale embedding generation from the similarity floor from the
 *     recruiter's own filters.
 *
 * Prerequisites: PostgreSQL with pgvector and the migrations applied. No
 * OpenAI key is needed — every vector here is constructed, never embedded.
 * The suite seeds and removes its own fixtures under a unique login prefix.
 */
import { sql } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { UserEntity } from "../../../../../core/entity/user/user-entity.js";
import { db } from "../../../../database/drizzle/index.js";
import { DrizzleUserRepository } from "../../../../database/drizzle/repositories/user.repository.js";
import {
  DrizzleResumeSearchRepository,
  ZERO_RESULT_LOG_PREFIX,
} from "../../../../database/drizzle/repositories/resume-search.repository.js";
import {
  resumeEmbeddings,
  resumes,
  users,
} from "../../../../database/drizzle/schema.js";
import {
  resolveEmbeddingModel,
  resolveEmbeddingVersion,
} from "../../../../../core/use-case/resumes/shared/embedding-config.js";
import type { SearchZeroResultDiagnostics } from "../../../../../core/use-case/resumes/shared/search-zero-result-diagnostics.js";
import { server } from "../../../server.js";

const PREFIX = `otw${Date.now().toString(36)}`;
const EMBEDDING_DIMENSIONS = 1536;
const repository = new DrizzleResumeSearchRepository();

/**
 * A one-hot unit vector. Two distinct axes sit at cosine 0 — below the default
 * `SEARCH_MIN_SIMILARITY` — so a candidate seeded on axis A is invisible to a
 * query on axis B, and a candidate queried with their OWN axis is the nearest
 * possible match at cosine 1.0. That makes "excluded" and "not similar"
 * distinguishable, which is the whole point of the fixture.
 */
function axisVector(axis: number): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  vector[axis % EMBEDDING_DIMENSIONS] = 1;
  return vector;
}

async function seedCandidate(options: {
  slug: string;
  axis: number;
  openToWork: boolean;
  withEmbedding?: boolean;
}): Promise<{ userId: string; resumeId: string; embedding: number[] }> {
  const login = `${PREFIX}-${options.slug}`;
  const embedding = axisVector(options.axis);

  const [user] = await db
    .insert(users)
    .values({
      name: `Open To Work ${options.slug}`,
      login,
      email: `${login}@example.test`,
      password: "not-a-real-password-hash",
      openToWork: options.openToWork,
    })
    .returning({ id: users.id });

  const [resume] = await db
    .insert(resumes)
    .values({
      userId: user.id,
      headlineTitle: "Full Stack Developer & AI Engineer",
      summary: "seeded by search-open-to-work-default.e2e.test.ts",
      spokenLanguages: [],
    })
    .returning({ id: resumes.id });

  if (options.withEmbedding !== false) {
    await db.insert(resumeEmbeddings).values({
      resumeId: resume.id,
      userId: user.id,
      embedding,
      contentHash: `${login}-hash`,
      embeddingModel: resolveEmbeddingModel(),
      embeddingVersion: resolveEmbeddingVersion(),
    });
  }

  return { userId: user.id, resumeId: resume.id, embedding };
}

/**
 * Runs a search that is expected to return nothing and hands back the
 * diagnostics the repository logged.
 *
 * Reading the log rather than a return value on purpose: the log line IS the
 * deliverable. A test that asserted on some internal object would pass while
 * the thing an on-call engineer actually reads stayed empty.
 */
async function captureZeroResultDiagnostics(
  queryEmbedding: number[],
  filters: Record<string, unknown>,
): Promise<SearchZeroResultDiagnostics> {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  try {
    const results = await repository.searchByEmbedding({
      queryEmbedding,
      topK: 50,
      filters,
    });
    expect(results).toEqual([]);

    const line = warn.mock.calls.find(
      (call) =>
        typeof call[0] === "string" && call[0].startsWith(ZERO_RESULT_LOG_PREFIX),
    );

    expect(
      line,
      `no "${ZERO_RESULT_LOG_PREFIX}" line was logged for an empty result set`,
    ).toBeDefined();

    return line![1] as SearchZeroResultDiagnostics;
  } finally {
    warn.mockRestore();
  }
}

describe("Open-to-work default and zero-result diagnostics E2E", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.execute(sql`
      DELETE FROM ${resumeEmbeddings}
      WHERE user_id IN (SELECT id FROM ${users} WHERE login LIKE ${`${PREFIX}%`})
    `);
    await db.execute(sql`
      DELETE FROM ${resumes}
      WHERE user_id IN (SELECT id FROM ${users} WHERE login LIKE ${`${PREFIX}%`})
    `);
    await db.execute(sql`
      DELETE FROM ${users} WHERE login LIKE ${`${PREFIX}%`}
    `);
  });

  // -------------------------------------------------------------------------
  // 1. The default, through the real registration route
  // -------------------------------------------------------------------------

  it("persists open_to_work = true for an account created through POST /auth/register", async () => {
    const login = `${PREFIX}-signup`;

    const response = await server.inject({
      method: "POST",
      url: "/auth/register",
      headers: { "content-type": "application/json" },
      payload: {
        email: `${login}@example.test`,
        login,
        name: "Signup Default",
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(201);

    const rows = (await db.execute(sql`
      SELECT open_to_work FROM ${users} WHERE login = ${login}
    `)) as unknown as Array<{ open_to_work: boolean }>;

    expect(rows).toHaveLength(1);
    // The row in Postgres, not the entity in memory. This is the assertion the
    // column default alone cannot make true if the insert writes an explicit
    // `false`.
    expect(rows[0]?.open_to_work).toBe(true);
  });

  /**
   * Discriminates the INSERT from the column default.
   *
   * The column now defaults to `true`, so "a new row is true" no longer proves
   * the insert carries the value — an insert that omitted `open_to_work`
   * entirely would produce the same row, and would then silently disagree with
   * whatever the entity said. Creating a user who is explicitly NOT open to
   * work is the discriminating case: the column default would make the row
   * `true`, so a `false` row can only have come from the insert sending the
   * entity's value.
   */
  it("writes open_to_work from the entity rather than falling through to the column default", async () => {
    const repositoryUnderTest = new DrizzleUserRepository();
    const login = `${PREFIX}-explicit`;

    await repositoryUnderTest.create(
      UserEntity.create({
        email: `${login}@example.test`,
        login,
        name: "Explicit Opt Out",
        password: "not-a-real-password-hash",
        openToWork: false,
        description: null,
        avatarUrl: null,
        googleId: null,
      }),
    );

    const rows = (await db.execute(sql`
      SELECT open_to_work FROM ${users} WHERE login = ${login}
    `)) as unknown as Array<{ open_to_work: boolean }>;

    expect(rows[0]?.open_to_work).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 2. "Even with only ONE developer registered"
  // -------------------------------------------------------------------------

  it("returns the only candidate in scope for a matching query", async () => {
    const only = await seedCandidate({
      slug: "solo",
      axis: 11,
      openToWork: true,
    });

    const results = await repository.searchByEmbedding({
      queryEmbedding: only.embedding,
      topK: 50,
      // Constrains the corpus to this one developer, whatever else the database
      // happens to hold.
      filters: { usernameContains: `${PREFIX}-solo` },
    });

    expect(results.map((result) => result.resumeId)).toEqual([only.resumeId]);
    expect(results[0]?.similarity).toBeGreaterThan(0.9);
  });

  // -------------------------------------------------------------------------
  // 3. The gate is unchanged
  // -------------------------------------------------------------------------

  it("still excludes a candidate who turned open-to-work off", async () => {
    const closed = await seedCandidate({
      slug: "closed",
      axis: 12,
      openToWork: false,
    });

    // Their own vector: cosine 1.0, the nearest possible match. If the gate
    // leaked they would come back first rather than be hidden by a low score.
    const results = await repository.searchByEmbedding({
      queryEmbedding: closed.embedding,
      topK: 50,
      filters: { usernameContains: `${PREFIX}-closed` },
    });

    expect(results).toEqual([]);
    expect(await repository.findCandidateContact(closed.resumeId)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // 4. The empty page now says why
  // -------------------------------------------------------------------------

  it("blames the open-to-work gate when it is what emptied the result", async () => {
    await seedCandidate({ slug: "diag-closed", axis: 13, openToWork: false });

    const diagnostics = await captureZeroResultDiagnostics(axisVector(13), {
      usernameContains: `${PREFIX}-diag-closed`,
    });

    expect(diagnostics.likelyCause).toBe("open-to-work-gate");
    expect(diagnostics.counts.matchingRecruiterFilters).toBe(1);
    expect(diagnostics.counts.excludedByOpenToWork).toBe(1);
    expect(diagnostics.survivors.afterOpenToWorkGate).toBe(0);
  });

  it("blames a missing current-generation embedding when that is the cause", async () => {
    await seedCandidate({
      slug: "diag-noembed",
      axis: 14,
      openToWork: true,
      withEmbedding: false,
    });

    const diagnostics = await captureZeroResultDiagnostics(axisVector(14), {
      usernameContains: `${PREFIX}-diag-noembed`,
    });

    expect(diagnostics.likelyCause).toBe("missing-current-embedding");
    expect(diagnostics.counts.excludedByOpenToWork).toBe(0);
    expect(diagnostics.counts.missingCurrentEmbedding).toBe(1);
  });

  it("blames the similarity floor when candidates were scored and all fell short", async () => {
    await seedCandidate({ slug: "diag-far", axis: 15, openToWork: true });

    // A different axis: cosine 0 against the seeded candidate, which is under
    // the default floor of 0.1 but is NOT an exclusion.
    const diagnostics = await captureZeroResultDiagnostics(axisVector(900), {
      usernameContains: `${PREFIX}-diag-far`,
    });

    expect(diagnostics.likelyCause).toBe("below-similarity-floor");
    expect(diagnostics.counts.belowSimilarityFloor).toBe(1);
  });

  it("blames the recruiter's own filters when they match nobody", async () => {
    const diagnostics = await captureZeroResultDiagnostics(axisVector(16), {
      usernameContains: `${PREFIX}-nobody-has-this-login`,
    });

    expect(diagnostics.likelyCause).toBe("recruiter-filters");
    expect(diagnostics.counts.matchingRecruiterFilters).toBe(0);
    // The corpus is not empty — that is a different cause entirely.
    expect(diagnostics.counts.totalResumes).toBeGreaterThan(0);
  });

  it("logs counts only, never candidate identity", async () => {
    const seeded = await seedCandidate({
      slug: "diag-pii",
      axis: 17,
      openToWork: false,
    });

    const diagnostics = await captureZeroResultDiagnostics(axisVector(17), {
      usernameContains: `${PREFIX}-diag-pii`,
    });

    const serialised = JSON.stringify(diagnostics);
    expect(serialised).not.toContain(seeded.userId);
    expect(serialised).not.toContain(seeded.resumeId);
    expect(serialised).not.toContain("example.test");
    // The filter KEY is the diagnostic signal; the value the recruiter typed
    // is not.
    expect(diagnostics.filterKeys).toEqual(["usernameContains"]);
    expect(serialised).not.toContain(PREFIX);
  });
});
