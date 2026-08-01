ALTER TABLE "users" ADD COLUMN "banner_image_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_accent" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme_preset" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "open_to_work" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "persona" text;