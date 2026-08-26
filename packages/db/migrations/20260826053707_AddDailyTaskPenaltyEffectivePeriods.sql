CREATE TYPE "public"."task_penalty_assessment_status" AS ENUM('active', 'voided');--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'penalty_recalculated';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'penalty_voided';--> statement-breakpoint
ALTER TABLE "taskMasters" ADD COLUMN "publicId" varchar(12);--> statement-breakpoint
ALTER TABLE "taskMasters" ADD COLUMN "penaltyOverrideAmountVnd" bigint;--> statement-breakpoint
ALTER TABLE "task_penalty_assessments" ADD COLUMN "status" "task_penalty_assessment_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_penalty_assessments" ADD COLUMN "voidedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_penalty_assessments" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "task_penalty_policies" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_penalty_policies" ADD COLUMN "supersededAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_penalty_policies" ADD COLUMN "supersededBy" uuid;--> statement-breakpoint
UPDATE "taskMasters"
SET "publicId" = substring(replace(uuid_generate_v4()::text, '-', '') FROM 1 FOR 12)
WHERE "publicId" IS NULL;--> statement-breakpoint
UPDATE "taskMasters" AS master
SET "penaltyOverrideAmountVnd" = (
  SELECT "overrideAmountVnd"
  FROM "task_master_penalty_policies"
  WHERE "taskMasterId" = master.id
  ORDER BY "effectiveFrom" DESC, "createdAt" DESC
  LIMIT 1
);--> statement-breakpoint
WITH ranked_policies AS (
  SELECT id, row_number() OVER (
    PARTITION BY priority
    ORDER BY "effectiveFrom" ASC, "createdAt" ASC, id ASC
  ) AS revision
  FROM "task_penalty_policies"
)
UPDATE "task_penalty_policies" AS policy
SET revision = ranked_policies.revision
FROM ranked_policies
WHERE policy.id = ranked_policies.id;--> statement-breakpoint
UPDATE "task_penalty_policies"
SET "supersededAt" = now()
WHERE "effectiveTo" IS NULL;--> statement-breakpoint
UPDATE "task_penalty_assessments"
SET status = 'voided', "voidedAt" = now(), "updatedAt" = now()
WHERE status = 'active';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_penalty_policies" ADD CONSTRAINT "task_penalty_policies_supersededBy_user_id_fk" FOREIGN KEY ("supersededBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_penalty_policy_priority_revision_idx" ON "task_penalty_policies" USING btree ("priority","revision");--> statement-breakpoint
ALTER TABLE "taskMasters" ADD CONSTRAINT "taskMasters_publicId_unique" UNIQUE("publicId");--> statement-breakpoint
ALTER TABLE "task_penalty_policies" ADD CONSTRAINT "task_penalty_policy_active_requires_end_check" CHECK ("task_penalty_policies"."supersededAt" IS NOT NULL OR "task_penalty_policies"."effectiveTo" IS NOT NULL);
