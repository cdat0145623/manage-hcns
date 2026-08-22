CREATE TYPE "public"."card_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "priority" "card_priority" DEFAULT 'medium' NOT NULL;