-- 1. Convert columns to text first
ALTER TABLE "public"."user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "public"."workspace_members" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint

-- 2. Drop the defaults that depend on the old enum type
ALTER TABLE "public"."user" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."workspace_members" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint

-- 3. Now safe to drop and recreate the type
DROP TYPE "public"."role";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'AREA_MANAGER', 'BRANCH_MANAGER', 'NVVP');--> statement-breakpoint

-- 4. Cast columns back to the new enum
ALTER TABLE "public"."user" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";--> statement-breakpoint
ALTER TABLE "public"."workspace_members" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";--> statement-breakpoint

-- 5. Restore defaults (adjust the default values to match your schema)
ALTER TABLE "public"."user" ALTER COLUMN "role" SET DEFAULT 'ADMIN'::"public"."role";--> statement-breakpoint
ALTER TABLE "public"."workspace_members" ALTER COLUMN "role" SET DEFAULT 'ADMIN'::"public"."role";