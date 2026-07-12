CREATE TABLE "profile_tabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"viewport" text NOT NULL,
	"title" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_blocks" DROP CONSTRAINT "profile_blocks_user_id_type_unique";--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "viewport" text NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "tab_id" uuid;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "grid_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "grid_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "grid_w" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "grid_h" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "pinned_all_tabs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD COLUMN "config" jsonb;--> statement-breakpoint
ALTER TABLE "profile_tabs" ADD CONSTRAINT "profile_tabs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_tabs_user_id_viewport_idx" ON "profile_tabs" USING btree ("user_id","viewport");--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD CONSTRAINT "profile_blocks_tab_id_profile_tabs_id_fk" FOREIGN KEY ("tab_id") REFERENCES "public"."profile_tabs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_blocks_user_id_viewport_idx" ON "profile_blocks" USING btree ("user_id","viewport");--> statement-breakpoint
ALTER TABLE "profile_blocks" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "profile_blocks" DROP COLUMN "order";