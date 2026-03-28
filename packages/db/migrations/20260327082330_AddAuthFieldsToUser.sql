ALTER TABLE "user" ALTER COLUMN "username" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "provider_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "user_id" text;