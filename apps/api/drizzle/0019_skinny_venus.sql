CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_delivery_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_on" date NOT NULL,
	"repo_fingerprint" text NOT NULL,
	"technologies" text[] DEFAULT '{}' NOT NULL,
	"actor_is_owner" boolean DEFAULT true NOT NULL,
	"counterparty_fingerprints" text[] DEFAULT '{}' NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_source_external_delivery_id_unique" UNIQUE("source","external_delivery_id")
);
--> statement-breakpoint
CREATE TABLE "git_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"external_account_id" text,
	"work_experience_id" uuid,
	"disclosure_level_override" text,
	"webhook_secret" text,
	"auto_post_enabled" boolean DEFAULT false NOT NULL,
	"cadence" text DEFAULT 'weekly' NOT NULL,
	"include_agent_summary" boolean DEFAULT false NOT NULL,
	"last_digest_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_connection_id_git_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_work_experience_id_work_experiences_id_fk" FOREIGN KEY ("work_experience_id") REFERENCES "public"."work_experiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_user_id_occurred_on_idx" ON "activity_events" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "activity_events_connection_id_idx" ON "activity_events" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "activity_events_technologies_gin_idx" ON "activity_events" USING gin ("technologies");--> statement-breakpoint
CREATE INDEX "git_connections_user_id_idx" ON "git_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "git_connections_work_experience_id_idx" ON "git_connections" USING btree ("work_experience_id");--> statement-breakpoint
CREATE UNIQUE INDEX "git_connections_user_provider_account_unique" ON "git_connections" USING btree ("user_id","provider","external_account_id") WHERE "git_connections"."external_account_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "git_connections_user_provider_kind_unique" ON "git_connections" USING btree ("user_id","provider","kind") WHERE "git_connections"."external_account_id" is null;