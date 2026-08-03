/**
 * Search-index maintenance commands.
 *
 *   npx tsx src/core/use-case/resumes/maintenance/backfill-search-index.ts status
 *   npx tsx src/core/use-case/resumes/maintenance/backfill-search-index.ts open-to-work
 *   npx tsx src/core/use-case/resumes/maintenance/backfill-search-index.ts reembed [--dry-run]
 *
 * Two things need a one-off pass whenever the search contract changes, and both
 * are silent failures if nobody runs them:
 *
 * `open-to-work` — `/resumes/search` is now gated on `users.open_to_work`
 * (defect F3). Every environment seeded before that gate existed has the column
 * at its `false` default, which makes the whole candidate base invisible. This
 * marks every user who has actually filled in a resume as open to work, which
 * is the intent the seed data was written with. It is deliberately a command
 * and not a migration: on a real deployment this is a product decision about
 * other people's visibility, not a schema change.
 *
 * `reembed` — `searchByEmbedding` now refuses to compare vectors from different
 * `embedding_model`/`embedding_version` generations (defect F13). That is
 * correct, but it means rows left behind on the old generation stop being
 * searchable rather than being ranked wrongly. This finds them and re-enqueues
 * the indexing job, which rebuilds both the blended and the per-source vectors.
 */

import "dotenv/config";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../../../../infra/database/drizzle/index.js";
import {
  resumeEmbeddings,
  resumes,
  users,
} from "../../../../infra/database/drizzle/schema.js";
import { BullMqResumeEmbeddingQueue } from "../../../../infra/providers/bullmq-resume-embedding-queue.js";
import {
  resolveEmbeddingModel,
  resolveEmbeddingVersion,
} from "../shared/embedding-config.js";

async function reportStatus(): Promise<void> {
  const model = resolveEmbeddingModel();
  const version = resolveEmbeddingVersion();

  const [counts] = await db
    .select({
      resumeCount: sql<number>`count(*)::int`,
      openToWork: sql<number>`count(*) FILTER (WHERE ${users.openToWork})::int`,
    })
    .from(resumes)
    .innerJoin(users, eq(users.id, resumes.userId));

  const [embeddings] = await db
    .select({
      total: sql<number>`count(*)::int`,
      current: sql<number>`count(*) FILTER (
        WHERE ${resumeEmbeddings.embeddingModel} = ${model}
          AND ${resumeEmbeddings.embeddingVersion} = ${version}
      )::int`,
    })
    .from(resumeEmbeddings);

  process.stdout.write(
    [
      `embedding space:        ${model} v${version}`,
      `resumes:                ${counts?.resumeCount ?? 0}`,
      `  searchable (open):    ${counts?.openToWork ?? 0}`,
      `blended embeddings:     ${embeddings?.total ?? 0}`,
      `  in current space:     ${embeddings?.current ?? 0}`,
      "",
    ].join("\n"),
  );
}

async function backfillOpenToWork(): Promise<void> {
  const updated = await db
    .update(users)
    .set({ openToWork: true })
    .where(
      and(
        eq(users.openToWork, false),
        sql`EXISTS (SELECT 1 FROM ${resumes} WHERE ${resumes.userId} = ${users.id})`,
      ),
    )
    .returning({ id: users.id });

  process.stdout.write(`marked ${updated.length} users as open to work\n`);
}

async function reembedStale(dryRun: boolean): Promise<void> {
  const model = resolveEmbeddingModel();
  const version = resolveEmbeddingVersion();

  // Stale = wrong generation, or no blended vector at all. The second case is
  // the one F27 produced: a job that kept 400ing left the candidate with no
  // row, and the inner join then hid them from every search forever.
  const stale = await db
    .select({ resumeId: resumes.id, userId: resumes.userId })
    .from(resumes)
    .leftJoin(resumeEmbeddings, eq(resumeEmbeddings.resumeId, resumes.id))
    .where(
      or(
        sql`${resumeEmbeddings.resumeId} IS NULL`,
        and(
          isNotNull(resumeEmbeddings.resumeId),
          or(
            ne(resumeEmbeddings.embeddingModel, model),
            ne(resumeEmbeddings.embeddingVersion, version),
          ),
        ),
      ),
    );

  process.stdout.write(`${stale.length} resumes need re-embedding\n`);

  if (dryRun || stale.length === 0) {
    return;
  }

  const queue = new BullMqResumeEmbeddingQueue();
  const triggeredAt = new Date().toISOString();

  for (const row of stale) {
    await queue.enqueue({
      resumeId: row.resumeId,
      userId: row.userId,
      reason: "resume-upsert",
      triggeredAt,
    });
  }

  process.stdout.write(`enqueued ${stale.length} indexing jobs\n`);
}

async function main(): Promise<void> {
  const [command] = process.argv.slice(2);
  const dryRun = process.argv.includes("--dry-run");

  switch (command) {
    case "status":
      await reportStatus();
      break;
    case "open-to-work":
      await backfillOpenToWork();
      break;
    case "reembed":
      await reembedStale(dryRun);
      break;
    default:
      process.stderr.write(
        "usage: backfill-search-index.ts <status|open-to-work|reembed> [--dry-run]\n",
      );
      process.exitCode = 1;
  }
}

await main();
process.exit(process.exitCode ?? 0);
