CREATE TABLE "candidate_interactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "resume_id" uuid NOT NULL,
  "recruiter_id" uuid NOT NULL,
  "interaction_type" text NOT NULL,
  "query_text" text,
  "semantic_similarity" real,
  "rank_position" integer,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "candidate_interactions"
  ADD CONSTRAINT "candidate_interactions_resume_id_resumes_id_fk"
  FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "candidate_interactions"
  ADD CONSTRAINT "candidate_interactions_recruiter_id_users_id_fk"
  FOREIGN KEY ("recruiter_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;

CREATE INDEX "candidate_interactions_resume_id_idx" ON "candidate_interactions" USING btree ("resume_id");
CREATE INDEX "candidate_interactions_recruiter_id_idx" ON "candidate_interactions" USING btree ("recruiter_id");
CREATE INDEX "candidate_interactions_created_at_idx" ON "candidate_interactions" USING btree ("created_at");
