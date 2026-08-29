import { TransactionRollbackError, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./index.js";
import { posts, users } from "./schema.js";

/**
 * Guards the two indexes that back the public-profile and recruiter-search read
 * paths against silent disappearance.
 *
 * Both were missing entirely until measured: `links` had no index on `user_id`
 * at all (every public profile view was a sequential scan), and the posts
 * subquery in `resume-search.repository.ts` had nothing carrying its sort key,
 * so `LIMIT 6` could not push down — Postgres read every published post a
 * candidate had and detoasted each `body` for `left(body, 400)` before throwing
 * all but six away, fifty times per search.
 *
 * Neither absence produces a failure. Queries stay correct and just get slower
 * as the tables grow, which is exactly the kind of regression that survives a
 * green test suite. These assertions pin the index definitions to the query
 * shapes that need them — in particular the ORDER BY expression, which must
 * match the repository's `COALESCE(published_at, created_at) DESC` character for
 * character or the planner will sort anyway.
 */

async function indexDefinitions(table: string): Promise<Map<string, string>> {
  const rows = await db.execute<{ indexname: string; indexdef: string }>(
    sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ${table}`,
  );

  return new Map(
    Array.from(rows).map((row) => [row.indexname, row.indexdef.toLowerCase()]),
  );
}

describe("search and profile read-path indexes", () => {
  it("indexes links by user in the order the public profile reads them", async () => {
    const indexes = await indexDefinitions("links");

    // `findPublicByUserId` — the public-profile hot path. The partial index has
    // to carry the ORDER BY columns too, or the sort survives the index scan.
    const publicIndex = indexes.get("links_public_user_id_order_idx");
    expect(publicIndex).toBeDefined();
    expect(publicIndex).toContain("user_id");
    expect(publicIndex).toContain('"order"');
    expect(publicIndex).toContain("created_at");
    expect(publicIndex).toContain("where is_public");

    // `findByUserId` / `findLastOrderByUserId` read the owner's private links
    // too, which the partial index above excludes.
    const allIndex = indexes.get("links_user_id_order_idx");
    expect(allIndex).toBeDefined();
    expect(allIndex).toContain("user_id");
    expect(allIndex).not.toContain("where");
  });

  it("indexes posts on the exact expression the recruiter search sorts by", async () => {
    const indexes = await indexDefinitions("posts");

    const sortIndex = indexes.get("posts_user_published_sort_idx");
    expect(sortIndex).toBeDefined();
    expect(sortIndex).toContain("user_id");
    expect(sortIndex).toContain("coalesce(published_at, created_at) desc");
    expect(sortIndex).toContain("status = 'published'");
  });

  it("lets the posts subquery stop at LIMIT instead of sorting everything", async () => {
    // THIS TEST SEEDS ITS OWN DATA, and that is the whole point.
    //
    // It used to EXPLAIN against whatever the shared dev database happened to
    // hold. Index choice is cost-based, so on a near-empty `posts` table the
    // planner correctly prefers `posts_user_id_idx` plus a Sort — six rows are
    // not worth a wider index — and the assertion failed. It passed or failed
    // depending on how many posts someone's last e2e run left behind, which
    // makes it a coin toss in the gate rather than a guard on the index.
    //
    // So: seed a realistic number of rows for one user, ANALYZE so the planner
    // sees them, and roll the whole thing back. Nothing leaks into the database
    // and the plan under test is the production-shaped one.
    const ROWS = 400;
    let planText = "";

    await db
      .transaction(async (tx) => {
        const [author] = await tx
          .insert(users)
          .values({
            email: `search-indexes-bench-${Date.now()}@example.test`,
            login: `search-indexes-bench-${Date.now()}`,
            name: "Search Indexes Bench",
            password: "not-a-real-hash",
          })
          .returning({ id: users.id });
        if (!author) throw new Error("failed to seed the bench author");

        await tx.insert(posts).values(
          Array.from({ length: ROWS }, (_, index) => ({
            userId: author.id,
            source: "manual" as const,
            body: `bench post ${index}`,
            status: "published" as const,
            createdAt: new Date(Date.now() - index * 86_400_000),
            publishedAt: new Date(Date.now() - index * 86_400_000),
          })),
        );
        await tx.execute(sql`ANALYZE posts`);
        await tx.execute(sql`SET LOCAL enable_seqscan = off`);

        const plan = await tx.execute<{ "QUERY PLAN": string }>(sql`
          EXPLAIN SELECT id
          FROM posts
          WHERE user_id = ${author.id}
            AND status = 'published'
          ORDER BY COALESCE(published_at, created_at) DESC
          LIMIT 6
        `);
        planText = Array.from(plan)
          .map((row) => row["QUERY PLAN"])
          .join("\n");

        // Drizzle signals a rollback by throwing; caught below.
        tx.rollback();
      })
      .catch((error) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });

    expect(planText).toContain("posts_user_published_sort_idx");
    expect(planText).not.toContain("Sort");
  });
});
