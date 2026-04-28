CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "resume_embeddings" (
	"resume_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resume_embeddings" ADD CONSTRAINT "resume_embeddings_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resume_embeddings" ADD CONSTRAINT "resume_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_resume_embeddings_vector" ON "resume_embeddings" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
