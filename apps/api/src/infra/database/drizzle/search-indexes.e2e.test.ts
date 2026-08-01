import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "./index.js";

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
    // With the dev dataset the planner is free to prefer a sequential scan —
    // that is the right call on a small table and not what is under test. What
    // matters is that when an index scan IS chosen, the plan carries no Sort
    // node: the index already provides the order, so the LIMIT terminates the
    // scan rather than being applied to a fully materialised result.
    const plan = await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);

      return tx.execute<{ "QUERY PLAN": string }>(sql`
        EXPLAIN SELECT id
        FROM posts
        WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid
          AND status = 'published'
        ORDER BY COALESCE(published_at, created_at) DESC
        LIMIT 6
      `);
    });

    const text = Array.from(plan)
      .map((row) => row["QUERY PLAN"])
      .join("\n");

    expect(text).toContain("posts_user_published_sort_idx");
    expect(text).not.toContain("Sort");
  });
});
