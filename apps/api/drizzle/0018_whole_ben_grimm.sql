-- Tabs become fully per-viewport. `group_id` was the shared identity that
-- linked a tab's pc-row to its mobile-row so structure mirrored across
-- viewports; that mirroring is what made a tab created in the mobile editor
-- appear in the desktop layout too. Dropping the column is the whole change.
--
-- Existing data survives as-is: every mirrored pair simply becomes two
-- independent tabs (same titles/orders, so nothing moves on screen), and
-- `profile_blocks.tab_id` always pointed at a tab of the block's OWN viewport,
-- so every block→tab association stays valid per viewport.
DROP INDEX "profile_tabs_group_id_idx";--> statement-breakpoint
ALTER TABLE "profile_tabs" DROP COLUMN "group_id";
