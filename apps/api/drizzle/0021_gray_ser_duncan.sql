ALTER TABLE "users" ADD COLUMN "tabs_enabled_pc" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tabs_enabled_mobile" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Backfill, appended by hand to the generated file. Without it every account
-- that had turned tabs OFF silently gets them back on, because both new columns
-- default to true. The copy runs BEFORE the drop, and each viewport starts from
-- the single value the user actually chose — per-viewport asymmetry is
-- something they opt into afterwards, never something a migration invents.
UPDATE "users" SET "tabs_enabled_pc" = "tabs_enabled", "tabs_enabled_mobile" = "tabs_enabled";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "tabs_enabled";
