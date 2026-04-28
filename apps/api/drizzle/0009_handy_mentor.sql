ALTER TABLE "candidate_interactions" ADD COLUMN "candidate_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_interactions" ADD COLUMN "query_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "candidate_interactions" ADD COLUMN "trained_at" timestamp;--> statement-breakpoint
CREATE INDEX "candidate_interactions_trained_at_idx" ON "candidate_interactions" USING btree ("trained_at");