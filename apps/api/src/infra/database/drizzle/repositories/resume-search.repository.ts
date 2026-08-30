import {
  normalizeSearchText,
  RECRUITER_SEARCH_EVIDENCE_LIMITS,
  type SearchSource,
} from "@repo/schemas";
import { and, eq, inArray, SQL, sql } from "drizzle-orm";
import {
  CandidateContactRecord,
  IResumeSearchRepository,
  RecruiterSearchFilters,
  SearchResumesByEmbeddingInput,
} from "../../../../core/repositories/resume-search/resume-search-repository.js";
import {
  CANDIDATE_SEARCH_FETCH_LIMITS,
  CandidatePostRow,
  CandidateWorkExperienceRow,
  toRecruiterWorkExperiences,
  toWorkEvidence,
} from "../../../../core/use-case/resumes/shared/build-candidate-search-projection.js";
import {
  readNumericEnv,
  resolveEmbeddingModel,
  resolveEmbeddingVersion,
  resolveEmbeddingVersionText,
} from "../../../../core/use-case/resumes/shared/embedding-config.js";
import {
  buildSearchZeroResultDiagnostics,
  type SearchZeroResultContext,
  type SearchZeroResultCounts,
} from "../../../../core/use-case/resumes/shared/search-zero-result-diagnostics.js";
import { structuredLoggingEnabled } from "../../../config/app-config.js";
import { db } from "../index.js";
import {
  posts,
  resumeEmbeddings,
  resumeSectionEmbeddings,
  resumeSkills,
  resumeTitles,
  resumes,
  skillsCatalog,
  titlesCatalog,
  users,
  workExperiences,
} from "../schema.js";

/**
 * Chars of post body pulled out of Postgres. The projection truncates further
 * for the recruiter-facing excerpt; clipping in SQL keeps a 20 000-char post
 * body from ever crossing the driver.
 */
const POST_BODY_SQL_CHARS = CANDIDATE_SEARCH_FETCH_LIMITS.postBodyChars;

/**
 * Work-experience descriptions are capped at 4 000 chars in the domain, but a
 * candidate with a dozen roles still adds up. Clip in SQL to the largest cap any
 * consumer needs, then let the projection apply the per-destination limit.
 */
const WORK_DESCRIPTION_SQL_CHARS =
  CANDIDATE_SEARCH_FETCH_LIMITS.workDescriptionChars;

/** Roles fetched per candidate; the projection applies the same cap. */
const MAX_WORK_EXPERIENCES_SQL =
  RECRUITER_SEARCH_EVIDENCE_LIMITS.maxWorkExperiences;

/**
 * Posts fetched per candidate. Wider than the number shown as evidence so
 * `toWorkEvidence` has room to promote commit-sourced posts over merely recent
 * ones. Backed by `posts_user_published_sort_idx`, which carries this exact
 * ORDER BY expression so the LIMIT stops the scan instead of detoasting every
 * published body the candidate has.
 */
const MAX_POSTS_SQL = CANDIDATE_SEARCH_FETCH_LIMITS.maxPosts;

/**
 * How many rows the ANN pass fetches per requested result.
 *
 * `SEARCH_MIN_SIMILARITY` used to be applied in JavaScript *after* `LIMIT topK`,
 * so a `topK=50` request that matched 50 rows but where 47 fell under the floor
 * returned 3 results and stopped — the floor silently became the page size
 * (defect F19). The floor now lives in the SQL predicate, and the over-fetch on
 * top of that gives the approximate index room to be wrong: ivfflat only ranks
 * exactly *within* the clusters it probes, so asking it for more than we intend
 * to keep is what makes the kept set close to the exact top-K.
 */
const DEFAULT_OVERFETCH_FACTOR = 4;

/** Never issue an unbounded LIMIT, however large topK and the factor are. */
const MAX_FETCH_ROWS = 1_000;

/**
 * Prefix on the zero-result explanation line. A constant so a log-based alert
 * and the e2e test that proves the line is emitted cannot drift from it.
 */
export const ZERO_RESULT_LOG_PREFIX = "[search] zero candidates";

/**
 * Serialised query vector, sent as a bind parameter rather than pasted into the
 * SQL text.
 *
 * 1 536 floats is ~32 kB. Inlining it via `sql.raw` put that 32 kB into the
 * statement twice (once for the similarity projection, once for ORDER BY), and
 * because Drizzle routes raw SQL through postgres.js `unsafe()` — which forces
 * `prepare: false` — every search paid a full PARSE + PLAN on 65 kB of unique
 * statement text. Nothing could ever be reused, because no two searches had the
 * same text. As a parameter the statement text is short and constant.
 */
function toPgVectorParam(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new Error("Query embedding must not be empty");
  }

  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new Error("Query embedding contains invalid values");
    }
  }

  return `[${embedding.join(",")}]`;
}

/**
 * Folds a free-text column to the same shape `normalizeSearchText` produces in
 * TypeScript: accents stripped, lowercased.
 *
 * `location`, `notice_period` and `spoken_languages` are free text the candidate
 * types, but the recruiter UI offers a fixed list ("Sao Paulo", "Immediate",
 * "English"). Comparing them raw made every candidate who wrote `São Paulo`
 * invisible (defect F8). `normalize(..., NFD)` splits `ã` into `a` + combining
 * tilde and the regex drops the combining marks.
 *
 * Note this is an expression, not an index — these filters are selective enough
 * to run as a recheck over the ANN candidate set. If they ever need to drive the
 * scan, the fix is an expression index carrying this exact expression.
 */
function foldedColumn(column: SQL | SQL.Aliased | unknown): SQL {
  return sql`regexp_replace(normalize(lower(${column}), NFD), '[̀-ͯ]', '', 'g')`;
}

function normalizeTerms(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => normalizeSearchText(value)).filter(Boolean),
    ),
  );
}

/**
 * `= ANY(...)` against a folded column.
 *
 * Two things here are load-bearing, and both fail as a 500 on every search
 * rather than as a wrong result:
 *
 * 1. `sql.param(...)`. Inside a `sql` template Drizzle treats a bare array as a
 *    list of SQL CHUNKS, not as one bind value — so `${["sao paulo"]}` binds the
 *    scalar `'sao paulo'`, and Postgres reports
 *    `malformed array literal: "sao paulo"`. `sql.param` forces it to bind the
 *    array as a single parameter.
 * 2. The `::text[]` cast. With a bare column on the left Postgres could infer
 *    the element type, but `foldedColumn` wraps it in `regexp_replace(...)`, and
 *    an expression gives the planner nothing to infer from.
 */
function foldedInAny(column: SQL | SQL.Aliased | unknown, wanted: string[]): SQL {
  return sql`${foldedColumn(column)} = ANY(${sql.param(wanted)}::text[])`;
}

/**
 * pgvector's installed version, resolved once per process.
 *
 * `ivfflat.iterative_scan` and `ivfflat.max_probes` only exist from 0.8.0. Set
 * them on an older build and the `SET LOCAL` errors, which aborts the
 * transaction and turns every search into a 500 — the same class of failure as
 * F20. So the capability is probed rather than assumed.
 */
let pgVectorVersionPromise: Promise<string | null> | null = null;

async function readPgVectorVersion(): Promise<string | null> {
  const rows = (await db.execute(
    sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`,
  )) as unknown as Array<{ extversion: string | null }>;

  return rows[0]?.extversion ?? null;
}

function supportsIterativeScan(version: string | null): boolean {
  if (!version) {
    return false;
  }

  const [major, minor] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10));

  if (!Number.isFinite(major) || !Number.isFinite(minor)) {
    return false;
  }

  return major > 0 || minor >= 8;
}

async function getPgVectorVersion(): Promise<string | null> {
  pgVectorVersionPromise ??= readPgVectorVersion().catch(() => null);
  return pgVectorVersionPromise;
}

export class DrizzleResumeSearchRepository implements IResumeSearchRepository {
  async searchByEmbedding(input: SearchResumesByEmbeddingInput) {
    const queryVector = toPgVectorParam(input.queryEmbedding);
    const scopedSources = normalizeSources(input.sources);

    // Kept separately from `filters`: the three predicates pushed on below are
    // invisible to the recruiter, and the zero-result diagnostics need to count
    // the population BEFORE them to say which one emptied it.
    const recruiterFilters = this.buildFilters(input);
    const filters = [...recruiterFilters];

    /**
     * THE authorization boundary for candidate discovery.
     *
     * `authGuard` only proves the caller holds a valid JWT — there is no
     * recruiter role in this system, so "authenticated" means "anyone who
     * signed up". Without this predicate every account could page the entire
     * candidate base, salary expectations included (defect F3). `open_to_work`
     * is the candidate's own, explicit statement that they want to be found;
     * it is the narrowest correct gate available on today's schema.
     */
    filters.push(eq(users.openToWork, true));

    // Only compare vectors that live in the same space. After a model or
    // version change the table holds two generations of vectors at once, and
    // cosine distance between them is a number with no meaning — old rows would
    // interleave with new ones and quietly poison the ranking (defect F13).
    const embeddingModel = resolveEmbeddingModel();

    const similarity = scopedSources
      ? this.buildScopedSimilarity(queryVector, scopedSources, embeddingModel)
      : sql<number>`1 - (${resumeEmbeddings.embedding} <=> ${queryVector}::vector)`;

    if (!scopedSources) {
      filters.push(eq(resumeEmbeddings.embeddingModel, embeddingModel));
      filters.push(
        eq(resumeEmbeddings.embeddingVersion, resolveEmbeddingVersion()),
      );
    }

    const minSimilarity = readNumericEnv("SEARCH_MIN_SIMILARITY", 0.1);

    // The floor belongs in the predicate, not in a post-pass over the page:
    // filtering after LIMIT is what let a topK=50 request return 3 (F19).
    if (minSimilarity > 0) {
      filters.push(sql`${similarity} >= ${minSimilarity}`);
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const overfetchFactor = Math.max(
      1,
      readNumericEnv("SEARCH_OVERFETCH_FACTOR", DEFAULT_OVERFETCH_FACTOR),
    );
    const fetchLimit = Math.min(
      MAX_FETCH_ROWS,
      Math.ceil(input.topK * overfetchFactor),
    );

    const rows = await db.transaction(async (tx) => {
      await this.applyIvfflatSettings(tx, fetchLimit);

      const selection = {
        ...this.buildCandidateSelection(),
        similarity: sql<number>`${similarity}`,
        sourceSimilarity: scopedSources
          ? this.buildSourceSimilarity(
              queryVector,
              scopedSources,
              embeddingModel,
            )
          : sql<null>`NULL::jsonb`,
      };

      // The scoped path deliberately does NOT join `resume_embeddings`: a
      // candidate is searchable on the sources they have, and requiring the
      // blended row too would drop anyone mid-reindex.
      const query = scopedSources
        ? tx.select(selection).from(resumes).innerJoin(
            users,
            eq(users.id, resumes.userId),
          )
        : tx
            .select(selection)
            .from(resumes)
            .innerJoin(users, eq(users.id, resumes.userId))
            .innerJoin(
              resumeEmbeddings,
              eq(resumeEmbeddings.resumeId, resumes.id),
            );

      return query
        .where(whereClause)
        // `resumes.id ASC` is not cosmetic: without a total order, two
        // candidates on an identical score come back in whatever order the
        // executor happened to produce, so the same request can return
        // different pages. Tests assert byte-identical repeat responses.
        .orderBy(sql`${similarity} DESC`, sql`${resumes.id} ASC`)
        .limit(fetchLimit);
    });

    const kept = rows.slice(0, input.topK);

    if (kept.length === 0) {
      // Awaited, not fire-and-forget: an unawaited promise here would log after
      // the response and, on a test or a worker that exits promptly, sometimes
      // not at all. It is one extra query on a path that already returned
      // nothing, and it never throws — see the method.
      await this.logZeroResultDiagnostics({
        queryVector,
        embeddingModel,
        minSimilarity,
        scopedSources,
        recruiterFilters,
        context: {
          topK: input.topK,
          minSimilarity,
          embeddingModel,
          embeddingVersion: resolveEmbeddingVersionText(),
          ...(scopedSources ? { sources: scopedSources } : {}),
          filterKeys: activeFilterKeys(input.filters),
        },
      });
    }

    return kept.map((item) => {
      const { posts: postRows, sourceSimilarity, ...candidate } = item;

      const candidatePosts: CandidatePostRow[] = postRows ?? [];

      return {
        ...candidate,
        // Never from a listing — see `ResumeSearchResult.email` (defect F3).
        email: null,
        ...(sourceSimilarity
          ? { sourceSimilarity: toSourceSimilarity(sourceSimilarity) }
          : {}),
        workExperiences: toRecruiterWorkExperiences(
          candidate.workExperiences ?? [],
        ),
        workEvidence: toWorkEvidence(candidatePosts),
      };
    });
  }

  async findCandidateContact(
    resumeId: string,
  ): Promise<CandidateContactRecord | null> {
    const [row] = await db
      .select({
        resumeId: resumes.id,
        userId: resumes.userId,
        name: users.name,
        username: users.login,
        email: users.email,
      })
      .from(resumes)
      .innerJoin(users, eq(users.id, resumes.userId))
      // Same boundary as the search. A `resumeId` held over from an earlier
      // session must not outlive the candidate's decision to stop looking.
      .where(and(eq(resumes.id, resumeId), eq(users.openToWork, true)));

    return row ?? null;
  }

  /**
   * Explains an empty result set, once, in one log line.
   *
   * Three predicates on this search can remove a candidate without anybody
   * being able to tell: the `open_to_work` gate, the equality on
   * `embedding_model`/`embedding_version`, and `SEARCH_MIN_SIMILARITY`. All
   * three are correct. All three are invisible — `/resumes/search` answers 200
   * with an empty array whichever one fired, and that is exactly how a
   * developer with a complete resume stayed undiscoverable while the API
   * reported success.
   *
   * This does NOT change any of them. It counts how many resumes each one
   * removed, so the next empty page comes with a reason attached.
   *
   * Cost: one extra query, only on the path that already returned nothing, and
   * only for as long as the recruiter waited for zero results anyway. It is a
   * sequential scan with a distance computation per resume — acceptable at this
   * table's size, and worth revisiting behind a sampling flag if the corpus
   * grows by an order of magnitude.
   *
   * PII: counts only. No candidate id, name, login or email, and the
   * recruiter's filter VALUES are excluded too — `nameContains` and
   * `profileTextContains` are free text typed about a person.
   */
  private async logZeroResultDiagnostics(params: {
    queryVector: string;
    embeddingModel: string;
    minSimilarity: number;
    scopedSources: SearchSource[] | undefined;
    /**
     * The recruiter's OWN filter predicates — the same array `searchByEmbedding`
     * built, before the open-to-work gate, the embedding-generation equality and
     * the similarity floor were pushed onto it. Scoping the counts to these is
     * what makes the answer about THIS search rather than about the corpus.
     */
    recruiterFilters: SQL[];
    context: SearchZeroResultContext;
  }): Promise<void> {
    const {
      queryVector,
      embeddingModel,
      minSimilarity,
      scopedSources,
      recruiterFilters,
    } = params;

    try {
      // `max()` over an empty set is NULL, so a NULL similarity means "this
      // candidate has no vector in the current generation" — precisely the
      // distinction the INNER JOIN in the real query silently collapses.
      const candidateSimilarity = scopedSources
        ? sql`(
            SELECT max(1 - (rse.embedding <=> ${queryVector}::vector))
            FROM ${resumeSectionEmbeddings} rse
            WHERE rse.user_id = ${resumes.userId}
              AND rse.source = ANY(${sql.param(scopedSources)}::text[])
              AND rse.embedding_model = ${embeddingModel}
              AND rse.embedding_version = ${resolveEmbeddingVersionText()}
          )`
        : sql`(
            SELECT max(1 - (re.embedding <=> ${queryVector}::vector))
            FROM ${resumeEmbeddings} re
            WHERE re.resume_id = ${resumes.id}
              AND re.embedding_model = ${embeddingModel}
              AND re.embedding_version = ${resolveEmbeddingVersion()}
          )`;

      const matchesRecruiterFilters =
        recruiterFilters.length > 0 ? and(...recruiterFilters) : sql`TRUE`;

      // The population is derived in a subquery because a select-list alias
      // (`similarity`, `matches_filters`) cannot be referenced from the same
      // select list. This is an exact scan, deliberately: comparing it against
      // what the ANN query returned is what makes recall collapse visible.
      const rows = (await db.execute(sql`
        SELECT
          count(*)::int AS total_resumes,
          count(*) FILTER (WHERE matches_filters)::int
            AS matching_recruiter_filters,
          count(*) FILTER (WHERE matches_filters AND NOT open_to_work)::int
            AS excluded_by_open_to_work,
          count(*) FILTER (
            WHERE matches_filters AND open_to_work AND similarity IS NULL
          )::int AS missing_current_embedding,
          count(*) FILTER (
            WHERE matches_filters
              AND open_to_work
              AND similarity IS NOT NULL
              AND similarity < ${minSimilarity}
          )::int AS below_similarity_floor
        FROM (
          SELECT
            ${users.openToWork} AS open_to_work,
            (${matchesRecruiterFilters}) AS matches_filters,
            ${candidateSimilarity} AS similarity
          FROM ${resumes}
          INNER JOIN ${users} ON ${users.id} = ${resumes.userId}
        ) AS population
      `)) as unknown as Array<Record<string, unknown>>;

      const row = rows[0];

      const counts: SearchZeroResultCounts = {
        totalResumes: toCount(row?.total_resumes),
        matchingRecruiterFilters: toCount(row?.matching_recruiter_filters),
        excludedByOpenToWork: toCount(row?.excluded_by_open_to_work),
        missingCurrentEmbedding: toCount(row?.missing_current_embedding),
        belowSimilarityFloor: toCount(row?.below_similarity_floor),
      };

      const diagnostics = buildSearchZeroResultDiagnostics(
        counts,
        params.context,
      );

      // Same convention as every other non-request log in `src/infra/`: one
      // JSON line where the pipeline is structured, a readable line where a
      // human is watching a terminal. There is no request in scope here.
      if (structuredLoggingEnabled()) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: ZERO_RESULT_LOG_PREFIX,
            ...diagnostics,
          }),
        );
        return;
      }

      console.warn(
        `${ZERO_RESULT_LOG_PREFIX} — ${diagnostics.reason}`,
        diagnostics,
      );
    } catch (error) {
      // A diagnostic must never be the reason a search fails. An empty result
      // set is still a valid answer; losing the explanation is strictly better
      // than turning it into a 500.
      console.warn(
        `${ZERO_RESULT_LOG_PREFIX} — diagnostics unavailable`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Raises ivfflat's effort when the query has selective filters.
   *
   * The default `probes = 10` against `lists = 100` visits ~10% of the vectors
   * and only *then* applies the SQL predicates. With a selective filter most of
   * the matching candidates live in clusters that were never opened, so they are
   * simply never seen — recall collapses without any error (defect F19).
   * pgvector 0.8's `iterative_scan = relaxed_order` keeps opening further
   * clusters until the LIMIT is satisfied (or `max_probes` is reached), which is
   * exactly the "scan more when the filter is selective" behaviour we need. On
   * older builds we fall back to a plain, validated `probes`.
   */
  private async applyIvfflatSettings(
    tx: { execute: (query: SQL) => Promise<unknown> },
    fetchLimit: number,
  ): Promise<void> {
    // `Number(process.env.IVFFLAT_PROBES)` used to be interpolated raw: with
    // `IVFFLAT_PROBES=abc` this became `SET LOCAL ivfflat.probes = NaN`, which
    // aborts the transaction and 500s every search (defect F20).
    const probes = Math.max(1, Math.round(readNumericEnv("IVFFLAT_PROBES", 10)));
    await tx.execute(sql`SET LOCAL ivfflat.probes = ${sql.raw(String(probes))}`);

    const version = await getPgVectorVersion();

    if (!supportsIterativeScan(version)) {
      return;
    }

    const maxProbes = Math.max(
      probes,
      Math.round(readNumericEnv("IVFFLAT_MAX_PROBES", 100)),
      // A large over-fetch is pointless if the index refuses to look that far.
      Math.min(MAX_FETCH_ROWS, fetchLimit),
    );

    await tx.execute(
      sql`SET LOCAL ivfflat.iterative_scan = ${sql.raw("relaxed_order")}`,
    );
    await tx.execute(
      sql`SET LOCAL ivfflat.max_probes = ${sql.raw(String(maxProbes))}`,
    );
  }

  /**
   * Fuses the selected per-source similarities with `max`.
   *
   * Why max and not a weighted sum: the three documents are wildly different in
   * length and vocabulary, so their cosine magnitudes are not calibrated against
   * each other — averaging them mostly measures which sources a candidate
   * happens to have filled in. Worse, a sum penalises exactly the candidate the
   * feature exists for: someone whose posts nail the query but whose resume is
   * thin would score below a mediocre all-round match. `max` reads as "the best
   * evidence found in any selected source", is monotone in every source, and
   * guarantees the metamorphic property that widening `sources` can only ever
   * raise a candidate's score. The per-source breakdown is returned alongside it
   * (`sourceSimilarity`) so the UI can attribute the score rather than guess.
   */
  private buildScopedSimilarity(
    queryVector: string,
    sources: SearchSource[],
    embeddingModel: string,
  ): SQL<number> {
    return sql<number>`COALESCE((
      SELECT max(1 - (rse.embedding <=> ${queryVector}::vector))
      FROM ${resumeSectionEmbeddings} rse
      WHERE rse.user_id = ${resumes.userId}
        AND rse.source = ANY(${sql.param(sources)}::text[])
        AND rse.embedding_model = ${embeddingModel}
        AND rse.embedding_version = ${resolveEmbeddingVersionText()}
    ), -1)`;
  }

  private buildSourceSimilarity(
    queryVector: string,
    sources: SearchSource[],
    embeddingModel: string,
  ): SQL<Record<string, number> | null> {
    return sql<Record<string, number> | null>`(
      SELECT jsonb_object_agg(
        rse.source,
        1 - (rse.embedding <=> ${queryVector}::vector)
      )
      FROM ${resumeSectionEmbeddings} rse
      WHERE rse.user_id = ${resumes.userId}
        AND rse.source = ANY(${sql.param(sources)}::text[])
        AND rse.embedding_model = ${embeddingModel}
        AND rse.embedding_version = ${resolveEmbeddingVersionText()}
    )`;
  }

  private buildFilters(input: SearchResumesByEmbeddingInput): SQL[] {
    const filters: SQL[] = [];
    const { filters: where } = input;

    if (where.contractTypes?.length) {
      filters.push(inArray(resumes.contractType, where.contractTypes));
    }

    if (where.seniorityLevels?.length) {
      filters.push(inArray(resumes.seniorityLevel, where.seniorityLevels));
    }

    if (where.workModels?.length) {
      filters.push(inArray(resumes.workModel, where.workModels));
    }

    // Accent- and case-insensitive on both sides — see `foldedColumn` (F8).
    if (where.locations?.length) {
      const wanted = normalizeTerms(where.locations);
      if (wanted.length > 0) {
        filters.push(foldedInAny(resumes.location, wanted));
      }
    }

    if (where.noticePeriods?.length) {
      const wanted = normalizeTerms(where.noticePeriods);
      if (wanted.length > 0) {
        filters.push(foldedInAny(resumes.noticePeriod, wanted));
      }
    }

    if (where.spokenLanguages?.length) {
      const wanted = normalizeTerms(where.spokenLanguages);
      if (wanted.length > 0) {
        // `&&` on the raw array was exact and case-sensitive; unnest + fold so
        // "portuguese", "Portuguese" and "Português" are one language.
        filters.push(sql`
          EXISTS (
            SELECT 1
            FROM unnest(${resumes.spokenLanguages}) AS spoken_language
            WHERE ${foldedInAny(sql`spoken_language`, wanted)}
          )
        `);
      }
    }

    if (where.openToRelocation !== undefined) {
      filters.push(sql`${resumes.openToRelocation} = ${where.openToRelocation}`);
    }

    if (where.minYearsExperience !== undefined) {
      filters.push(
        sql`${resumes.totalYearsExperience} >= ${where.minYearsExperience}`,
      );
    }

    if (where.maxYearsExperience !== undefined) {
      filters.push(
        sql`${resumes.totalYearsExperience} <= ${where.maxYearsExperience}`,
      );
    }

    if (where.skills?.length) {
      for (const skillTerm of where.skills) {
        const normalized = normalizeSearchText(skillTerm);
        if (!normalized) {
          continue;
        }

        filters.push(sql`
          EXISTS (
            SELECT 1
            FROM ${resumeSkills} rs
            INNER JOIN ${skillsCatalog} sc ON sc.id = rs.skill_id
            WHERE rs.resume_id = ${resumes.id}
              AND ${foldedColumn(sql`sc.name`)} LIKE ${`%${normalized}%`}
          )
        `);
      }
    }

    if (where.titles?.length) {
      for (const titleTerm of where.titles) {
        const normalized = normalizeSearchText(titleTerm);
        if (!normalized) {
          continue;
        }

        filters.push(sql`
          EXISTS (
            SELECT 1
            FROM ${resumeTitles} rt
            INNER JOIN ${titlesCatalog} tc ON tc.id = rt.title_id
            WHERE rt.resume_id = ${resumes.id}
              AND ${foldedColumn(sql`tc.name`)} LIKE ${`%${normalized}%`}
          )
        `);
      }
    }

    /**
     * Salary is a RANGE OVERLAP, and an unstated bound means "unbounded".
     *
     * Both branches used to require the column `IS NOT NULL`, so setting only
     * `maxSalary` silently deleted every candidate who left salary blank
     * (defect F12) — and most do. Overlap is the natural reading of two bands
     * meeting: the recruiter's [minSalary, maxSalary] intersects the
     * candidate's [expectationMin, expectationMax] unless one is entirely above
     * the other. A NULL expectation is not a mismatch, it is an absence of
     * information, and dropping those candidates hides exactly the people who
     * are flexible on pay.
     */
    if (where.minSalary !== undefined) {
      filters.push(
        sql`(${resumes.salaryExpectationMax} IS NULL OR ${resumes.salaryExpectationMax} >= ${where.minSalary})`,
      );
    }

    if (where.maxSalary !== undefined) {
      filters.push(
        sql`(${resumes.salaryExpectationMin} IS NULL OR ${resumes.salaryExpectationMin} <= ${where.maxSalary})`,
      );
    }

    if (where.nameContains) {
      filters.push(
        sql`${foldedColumn(users.name)} LIKE ${`%${normalizeSearchText(where.nameContains)}%`}`,
      );
    }

    if (where.usernameContains) {
      filters.push(
        sql`${foldedColumn(users.login)} LIKE ${`%${normalizeSearchText(where.usernameContains)}%`}`,
      );
    }

    if (where.profileTextContains) {
      const normalized = normalizeSearchText(where.profileTextContains);
      filters.push(sql`
        ${foldedColumn(sql`concat_ws(
          ' ',
          coalesce(${resumes.summary}, ''),
          coalesce(${resumes.headlineTitle}, ''),
          coalesce(${users.description}, '')
        )`)} LIKE ${`%${normalized}%`}
      `);
    }

    return filters;
  }

  private buildCandidateSelection() {
    return {
      userId: resumes.userId,
      resumeId: resumes.id,
      username: users.login,
      name: users.name,
      userPhoto: users.avatarUrl,
      profileDescription: users.description,
      headlineTitle: resumes.headlineTitle,
      summary: resumes.summary,
      totalYearsExperience: resumes.totalYearsExperience,
      location: resumes.location,
      seniorityLevel: resumes.seniorityLevel,
      workModel: resumes.workModel,
      contractType: resumes.contractType,
      spokenLanguages: resumes.spokenLanguages,
      noticePeriod: resumes.noticePeriod,
      openToRelocation: resumes.openToRelocation,
      salaryExpectationMin: resumes.salaryExpectationMin,
      salaryExpectationMax: resumes.salaryExpectationMax,
      skills: sql<string[]>`COALESCE((
        SELECT array_agg(${skillsCatalog.name} ORDER BY ${resumeSkills.displayOrder})
        FROM ${resumeSkills}
        INNER JOIN ${skillsCatalog} ON ${skillsCatalog.id} = ${resumeSkills.skillId}
        WHERE ${resumeSkills.resumeId} = ${resumes.id}
      ), ARRAY[]::text[])`,
      titles: sql<string[]>`COALESCE((
        SELECT array_agg(${titlesCatalog.name} ORDER BY ${resumeTitles.displayOrder})
        FROM ${resumeTitles}
        INNER JOIN ${titlesCatalog} ON ${titlesCatalog.id} = ${resumeTitles.titleId}
        WHERE ${resumeTitles.resumeId} = ${resumes.id}
      ), ARRAY[]::text[])`,
      // Work history is keyed by user (not resume); aggregate the roles the
      // candidate actually held so the reranker can match on real experience
      // and the result card can show a dated timeline. Bounded and clipped
      // in SQL so one candidate with a long history can't bloat a top-50
      // response.
      workExperiences: sql<CandidateWorkExperienceRow[]>`COALESCE((
        SELECT json_agg(
          json_build_object(
            'title', we.title,
            'companyName', we.company_name,
            'description', we.description,
            'mainStack', we.main_stack,
            'startDate', we.start_date,
            'endDate', we.end_date,
            'isCurrent', we.is_current,
            'employmentType', we.employment_type,
            'workModel', we.work_model
          )
          ORDER BY we.display_order
        )
        FROM (
          SELECT
            ${workExperiences.title} AS title,
            ${workExperiences.companyName} AS company_name,
            left(${workExperiences.description}, ${WORK_DESCRIPTION_SQL_CHARS}) AS description,
            ${workExperiences.mainStack} AS main_stack,
            ${workExperiences.startDate} AS start_date,
            ${workExperiences.endDate} AS end_date,
            ${workExperiences.isCurrent} AS is_current,
            ${workExperiences.employmentType} AS employment_type,
            ${workExperiences.workModel} AS work_model,
            ${workExperiences.displayOrder} AS display_order
          FROM ${workExperiences}
          WHERE ${workExperiences.userId} = ${resumes.userId}
          ORDER BY ${workExperiences.displayOrder}
          LIMIT ${MAX_WORK_EXPERIENCES_SQL}
        ) we
      ), '[]'::json)`,
      // Published posts — including every commit summary written by the MCP
      // server. This is the only place a recruiter can see what the person
      // actually shipped. Bodies are clipped in SQL; the projection
      // truncates further for the visible excerpt.
      posts: sql<CandidatePostRow[]>`COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', p.id,
            'title', p.title,
            'body', p.body,
            'source', p.source,
            'tags', p.tags,
            'externalUrl', p.external_url,
            'publishedAt', p.published_at
          )
          ORDER BY p.sort_at DESC
        )
        FROM (
          SELECT
            ${posts.id} AS id,
            ${posts.title} AS title,
            left(${posts.body}, ${POST_BODY_SQL_CHARS}) AS body,
            ${posts.source} AS source,
            ${posts.tags} AS tags,
            ${posts.externalUrl} AS external_url,
            ${posts.publishedAt} AS published_at,
            COALESCE(${posts.publishedAt}, ${posts.createdAt}) AS sort_at
          FROM ${posts}
          WHERE ${posts.userId} = ${resumes.userId}
            AND ${posts.status} = 'published'
          ORDER BY COALESCE(${posts.publishedAt}, ${posts.createdAt}) DESC
          LIMIT ${MAX_POSTS_SQL}
        ) p
      ), '[]'::json)`,
    };
  }
}

/**
 * `count(*)::int` comes back as a number on postgres.js, but a driver or a
 * cast change turning it into a string must not make the diagnostics read
 * `NaN` — a wrong number in an explanation is worse than no explanation.
 */
function toCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * The filter KEYS the recruiter actually supplied. Values are deliberately
 * dropped — see `logZeroResultDiagnostics`.
 *
 * An empty array counts as "not supplied": the search UI sends `[]` for a
 * facet nobody touched, and reporting that as an active filter would point the
 * reader at a filter that excluded nothing.
 */
function activeFilterKeys(filters: RecruiterSearchFilters): string[] {
  return Object.entries(filters)
    .filter(([, value]) => {
      if (value === undefined || value === null) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      if (typeof value === "string") {
        return value.trim().length > 0;
      }
      return true;
    })
    .map(([key]) => key)
    .sort();
}

/**
 * `undefined` when the caller did not scope the search, so the blended vector
 * path stays byte-for-byte what it always was. An empty array is treated the
 * same way — "no sources selected" is a UI state, not a request for zero
 * results.
 */
function normalizeSources(
  sources: SearchSource[] | undefined,
): SearchSource[] | undefined {
  if (!sources?.length) {
    return undefined;
  }

  return Array.from(new Set(sources));
}

function toSourceSimilarity(
  raw: unknown,
): Partial<Record<SearchSource, number>> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const result: Partial<Record<SearchSource, number>> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const numeric = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numeric)) {
      result[key as SearchSource] = numeric;
    }
  }

  return result;
}
