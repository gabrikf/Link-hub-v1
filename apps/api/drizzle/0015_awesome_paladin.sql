-- Viewport mirroring: link the pc-row and mobile-row of the same logical
-- tab/block via a shared `group_id`. Columns are added NULLABLE, backfilled with
-- a best-effort pc<->mobile pairing, then promoted to NOT NULL.

-- 1. Add the columns as nullable so existing rows can be backfilled.
ALTER TABLE "profile_tabs" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "group_id" uuid;--> statement-breakpoint

-- 2. Seed every row with a fresh unique id (fallback identity). Rows that can be
--    paired below get the pc-row's id copied onto the mobile-row; unpaired rows
--    keep their own fresh id so at least NEW actions mirror.
UPDATE "profile_tabs" SET "group_id" = gen_random_uuid() WHERE "group_id" IS NULL;--> statement-breakpoint
UPDATE "profile_blocks" SET "group_id" = gen_random_uuid() WHERE "group_id" IS NULL;--> statement-breakpoint

-- 3. Pair tabs: a mobile tab mirrors the pc tab of the same user at the same
--    ordinal ("order"). Copy the pc-row's group_id onto its mobile counterpart.
UPDATE "profile_tabs" AS m
SET "group_id" = p."group_id"
FROM "profile_tabs" AS p
WHERE m."viewport" = 'mobile'
  AND p."viewport" = 'pc'
  AND m."user_id" = p."user_id"
  AND m."order" = p."order";--> statement-breakpoint

-- 4. Pair blocks (must run AFTER tabs are paired so tab.group_id is stable).
--    Logical key = (user_id, kind, tab-group-or-'pinned'). Within each key and
--    viewport, blocks are ranked by (grid_y, grid_x, created_at); the mobile
--    block at rank N mirrors the pc block at rank N.
WITH ranked AS (
  SELECT
    b."id",
    b."viewport",
    b."user_id",
    b."kind",
    COALESCE(t."group_id"::text, 'pinned') AS tab_group,
    row_number() OVER (
      PARTITION BY b."user_id", b."kind",
        COALESCE(t."group_id"::text, 'pinned'), b."viewport"
      ORDER BY b."grid_y", b."grid_x", b."created_at"
    ) AS rn
  FROM "profile_blocks" b
  LEFT JOIN "profile_tabs" t ON t."id" = b."tab_id"
),
pc_ranked AS (
  SELECT r."user_id", r."kind", r.tab_group, r.rn, pb."group_id"
  FROM ranked r
  JOIN "profile_blocks" pb ON pb."id" = r."id"
  WHERE r."viewport" = 'pc'
),
mobile_ranked AS (
  SELECT r."id", r."user_id", r."kind", r.tab_group, r.rn
  FROM ranked r
  WHERE r."viewport" = 'mobile'
)
UPDATE "profile_blocks" AS m
SET "group_id" = pc_ranked."group_id"
FROM mobile_ranked
JOIN pc_ranked
  ON pc_ranked."user_id" = mobile_ranked."user_id"
  AND pc_ranked."kind" = mobile_ranked."kind"
  AND pc_ranked.tab_group = mobile_ranked.tab_group
  AND pc_ranked.rn = mobile_ranked.rn
WHERE m."id" = mobile_ranked."id";--> statement-breakpoint

-- 5. Enforce NOT NULL now that every row is populated.
ALTER TABLE "profile_tabs" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ALTER COLUMN "group_id" SET NOT NULL;--> statement-breakpoint

-- 6. Indexes for group-scoped lookups.
CREATE INDEX "profile_blocks_group_id_idx" ON "profile_blocks" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "profile_tabs_group_id_idx" ON "profile_tabs" USING btree ("group_id");
