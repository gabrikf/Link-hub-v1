import { and, eq, inArray, sql } from "drizzle-orm";
import {
  IResumeSearchRepository,
  SearchResumesByEmbeddingInput,
} from "../../../../core/repositories/resume-search/resume-search-repository.js";
import { db } from "../index.js";
import {
  resumeEmbeddings,
  resumeSkills,
  resumeTitles,
  resumes,
  skillsCatalog,
  titlesCatalog,
  users,
} from "../schema.js";

function toPgVectorLiteral(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new Error("Query embedding must not be empty");
  }

  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new Error("Query embedding contains invalid values");
    }
  }

  return `'[${embedding.join(",")}]'::vector`;
}

export class DrizzleResumeSearchRepository implements IResumeSearchRepository {
  async searchByEmbedding(input: SearchResumesByEmbeddingInput) {
    const vectorLiteral = toPgVectorLiteral(input.queryEmbedding);

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
          similarity: sql<number>`1 - (${resumeEmbeddings.embedding} <=> ${sql.raw(vectorLiteral)})`,
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
        })
        .from(resumes)
        .innerJoin(users, eq(users.id, resumes.userId))
        .innerJoin(resumeEmbeddings, eq(resumeEmbeddings.resumeId, resumes.id))
        .where(whereClause)
        .orderBy(
          sql`${resumeEmbeddings.embedding} <=> ${sql.raw(vectorLiteral)}`,
        )
        .limit(input.topK);
    });

    const mapped = rows.map((item) => ({
      ...item,
      combinedText: [
        item.headlineTitle,
        item.summary,
        item.location,
        item.seniorityLevel,
        ...item.skills,
        ...item.titles,
      ]
        .filter((value) => Boolean(value && value.trim().length > 0))
        .join("\n"),
    }));

    const filtered = mapped.filter(
      (item) =>
        !Number.isFinite(minSimilarity) ||
        minSimilarity <= 0 ||
        item.similarity >= minSimilarity,
    );

    return filtered;
  }
}
