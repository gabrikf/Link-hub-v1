CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp;--> statement-breakpoint
-- Backfill, appended by hand to the generated file.
--
-- WITHOUT THIS EVERY EXISTING ACCOUNT IS LOCKED OUT. `email_verified_at`
-- arrives NULL, and from the next deploy `LoginUseCase` refuses a password
-- login on a NULL — which is ~301 seeded accounts plus every real account in
-- dev and production, none of whom were ever sent a verification link and none
-- of whom can ask for one without first signing in.
--
-- now() rather than created_at: this is the moment the platform decided to
-- trust these addresses, and stamping the signup date would be inventing a
-- verification event that never happened.
UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_verification_tokens_user_id_created_at_idx" ON "email_verification_tokens" USING btree ("user_id","created_at");