CREATE TABLE "resume_section_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resume_section_embeddings_user_id_source_unique" UNIQUE("user_id","source")
);
--> statement-breakpoint
ALTER TABLE "candidate_interactions" ADD COLUMN "displayed_rank" integer;--> statement-breakpoint
ALTER TABLE "candidate_interactions" ADD COLUMN "result_count" integer;--> statement-breakpoint
ALTER TABLE "candidate_interactions" ADD COLUMN "search_session_id" text;--> statement-breakpoint
ALTER TABLE "candidate_interactions" ADD COLUMN "propensity" real;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "work_experience_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agent_disclosure_level" text DEFAULT 'summary' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agent_blocked_terms" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "work_experiences" ADD COLUMN "disclosure_level" text;--> statement-breakpoint
ALTER TABLE "resume_section_embeddings" ADD CONSTRAINT "resume_section_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resume_section_embeddings_source_idx" ON "resume_section_embeddings" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_resume_section_embeddings_vector" ON "resume_section_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_work_experience_id_work_experiences_id_fk" FOREIGN KEY ("work_experience_id") REFERENCES "public"."work_experiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_work_experience_id_idx" ON "posts" USING btree ("work_experience_id");--> statement-breakpoint
CREATE INDEX "posts_tags_gin_idx" ON "posts" USING gin ("tags");--> statement-breakpoint
-- `IF NOT EXISTS` (hand-edited into the generated statement): this index was
-- created by hand in 0006_resume_embeddings.sql, so every database migrated
-- through 0006 already has it. Drizzle only just learned about it — declaring
-- it in schema.ts is what stops a future `generate` from proposing a DROP —
-- but the CREATE has to be idempotent or this migration fails on every
-- existing environment with "relation already exists".
CREATE INDEX IF NOT EXISTS "idx_resume_embeddings_vector" ON "resume_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists=100);