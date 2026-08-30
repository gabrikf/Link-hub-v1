ALTER TABLE "users" ALTER COLUMN "open_to_work" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "tabs_enabled_pc" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "tabs_enabled_mobile" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "persona_other" text;