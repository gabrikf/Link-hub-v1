import { RECRUITER_SEARCH_EVIDENCE_LIMITS } from "@repo/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  IResumeSearchRepository,
  SearchResumesByEmbeddingInput,
} from "../../../../core/repositories/resume-search/resume-search-repository.js";
import {
  CANDIDATE_SEARCH_FETCH_LIMITS,
  CandidatePostRow,
  CandidateWorkExperienceRow,
  toRecruiterWorkExperiences,
  toWorkEvidence,
} from "../../../../core/use-case/resumes/shared/build-candidate-search-projection.js";
import { db } from "../index.js";
import {
  posts,
  resumeEmbeddings,
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

export class DrizzleResumeSearchRepository implements IResumeSearchRepository {
  async searchByEmbedding(input: SearchResumesByEmbeddingInput) {
    const queryVector = toPgVectorParam(input.queryEmbedding);

    const filters: ReturnType<typeof sql>[] = [];

    if (input.filters.contractTypes?.length) {
      filters.push(inArray(resumes.contractType, input.filters.contractTypes));
    }

    if (input.filters.seniorityLevels?.length) {
      filters.push(
        inArray(resumes.seniorityLevel, input.filters.seniorityLevels),
      );
    }

    if (input.filters.workModels?.length) {
      filters.push(inArray(resumes.workModel, input.filters.workModels));
    }

    if (input.filters.locations?.length) {
      filters.push(inArray(resumes.location, input.filters.locations));
    }

    if (input.filters.noticePeriods?.length) {
      filters.push(inArray(resumes.noticePeriod, input.filters.noticePeriods));
    }

    if (input.filters.openToRelocation !== undefined) {
      filters.push(
        sql`${resumes.openToRelocation} = ${input.filters.openToRelocation}`,
      );
    }

    if (input.filters.minYearsExperience !== undefined) {
      filters.push(
        sql`${resumes.totalYearsExperience} >= ${input.filters.minYearsExperience}`,
      );
    }

    if (input.filters.maxYearsExperience !== undefined) {
      filters.push(
        sql`${resumes.totalYearsExperience} <= ${input.filters.maxYearsExperience}`,
      );
    }

    if (input.filters.spokenLanguages?.length) {
      filters.push(
        sql`${resumes.spokenLanguages} && ${input.filters.spokenLanguages}`,
      );
    }

    if (input.filters.skills?.length) {
      for (const skillTerm of input.filters.skills) {
        const normalized = skillTerm.trim().toLowerCase();
        if (!normalized) {
          continue;
        }

        filters.push(sql`
          EXISTS (
            SELECT 1
            FROM ${resumeSkills} rs
            INNER JOIN ${skillsCatalog} sc ON sc.id = rs.skill_id
            WHERE rs.resume_id = ${resumes.id}
              AND lower(sc.name) LIKE ${`%${normalized}%`}
          )
        `);
      }
    }

    if (input.filters.titles?.length) {
      for (const titleTerm of input.filters.titles) {
        const normalized = titleTerm.trim().toLowerCase();
        if (!normalized) {
          continue;
        }

        filters.push(sql`
          EXISTS (
            SELECT 1
            FROM ${resumeTitles} rt
            INNER JOIN ${titlesCatalog} tc ON tc.id = rt.title_id
            WHERE rt.resume_id = ${resumes.id}
              AND lower(tc.name) LIKE ${`%${normalized}%`}
          )
        `);
      }
    }

    if (input.filters.minSalary !== undefined) {
      filters.push(
        sql`${resumes.salaryExpectationMin} IS NOT NULL AND ${resumes.salaryExpectationMin} >= ${input.filters.minSalary}`,
      );
    }

    if (input.filters.maxSalary !== undefined) {
      filters.push(
        sql`${resumes.salaryExpectationMax} IS NOT NULL AND ${resumes.salaryExpectationMax} <= ${input.filters.maxSalary}`,
      );
    }

    if (input.filters.nameContains) {
      filters.push(
        sql`lower(${users.name}) LIKE ${`%${input.filters.nameContains.toLowerCase()}%`}`,
      );
    }

    if (input.filters.usernameContains) {
      filters.push(
        sql`lower(${users.login}) LIKE ${`%${input.filters.usernameContains.toLowerCase()}%`}`,
      );
    }

    if (input.filters.profileTextContains) {
      const normalized = input.filters.profileTextContains.toLowerCase();
      filters.push(sql`
        lower(
          concat_ws(
            ' ',
            coalesce(${resumes.summary}, ''),
            coalesce(${resumes.headlineTitle}, ''),
            coalesce(${users.description}, '')
          )
        ) LIKE ${`%${normalized}%`}
      `);
    }

    const minSimilarity = Number(process.env.SEARCH_MIN_SIMILARITY ?? "0.1");

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    // IVFFLAT with many lists can return 0 rows when the nearest cluster is
    // empty (common for small datasets). Setting probes ensures we scan enough
    // clusters to find results. ENV var allows tuning per environment.
    const ivfflatProbes = Number(process.env.IVFFLAT_PROBES ?? "10");

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ivfflat.probes = ${ivfflatProbes}`));
      return tx
        .select({
          userId: resumes.userId,
          resumeId: resumes.id,
          username: users.login,
          name: users.name,
          userPhoto: users.avatarUrl,
          profileDescription: users.description,
          email: users.email,
          similarity: sql<number>`1 - (${resumeEmbeddings.embedding} <=> ${queryVector}::vector)`,
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
        })
        .from(resumes)
        .innerJoin(users, eq(users.id, resumes.userId))
        .innerJoin(resumeEmbeddings, eq(resumeEmbeddings.resumeId, resumes.id))
        .where(whereClause)
        .orderBy(sql`${resumeEmbeddings.embedding} <=> ${queryVector}::vector`)
        .limit(input.topK);
    });

    const mapped = rows.map((item) => {
      const { posts: postRows, ...candidate } = item;

      const candidatePosts: CandidatePostRow[] = postRows ?? [];

      const workExperiencesProjection = toRecruiterWorkExperiences(
        candidate.workExperiences ?? [],
      );

      return {
        ...candidate,
        workExperiences: workExperiencesProjection,
        workEvidence: toWorkEvidence(candidatePosts),
      };
    });

    const filtered = mapped.filter(
      (item) =>
        !Number.isFinite(minSimilarity) ||
        minSimilarity <= 0 ||
        item.similarity >= minSimilarity,
    );

    return filtered;
  }
}
