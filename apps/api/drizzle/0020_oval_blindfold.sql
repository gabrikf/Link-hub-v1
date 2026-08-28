CREATE TABLE "user_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"language" text,
	"theme" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_language_check" CHECK ("user_preferences"."language" IS NULL OR "user_preferences"."language" IN ('en-US', 'pt-BR', 'es-ES')),
	CONSTRAINT "user_preferences_theme_check" CHECK ("user_preferences"."theme" IN ('light', 'dark', 'system'))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tabs_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill, appended by hand to the generated file: without it every account
-- that existed before this migration has no preferences row, and the read path
-- would have to invent one on every request forever. Rows get the column
-- defaults — language NULL, theme 'system' — which is exactly "follow the
-- device", i.e. the behaviour those accounts already had.
-- ON CONFLICT DO NOTHING keeps the statement replayable.
INSERT INTO "user_preferences" ("user_id") SELECT "id" FROM "users" ON CONFLICT DO NOTHING;
