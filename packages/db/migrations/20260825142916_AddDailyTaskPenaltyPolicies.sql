CREATE TYPE "public"."task_penalty_priority" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."task_penalty_source" AS ENUM('system_default', 'global_policy', 'master_override');--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'penalty_assessed';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_master_penalty_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"taskMasterId" uuid NOT NULL,
	"priority" "task_penalty_priority" NOT NULL,
	"overrideAmountVnd" bigint,
	"effectiveFrom" timestamp with time zone NOT NULL,
	"effectiveTo" timestamp with time zone,
	"createdBy" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_master_penalty_policies_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_penalty_assessments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"taskInstanceId" uuid NOT NULL,
	"amountVnd" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'VND' NOT NULL,
	"source" "task_penalty_source" NOT NULL,
	"policyPublicId" varchar(12),
	"assessedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_penalty_assessments_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "task_penalty_assessments_taskInstanceId_unique" UNIQUE("taskInstanceId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_penalty_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"priority" "task_penalty_priority" NOT NULL,
	"amountVnd" bigint NOT NULL,
	"source" "task_penalty_source" DEFAULT 'global_policy' NOT NULL,
	"effectiveFrom" timestamp with time zone NOT NULL,
	"effectiveTo" timestamp with time zone,
	"createdBy" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_penalty_policies_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "taskInstances" ADD COLUMN "penaltyPriority" "task_penalty_priority";--> statement-breakpoint
ALTER TABLE "taskInstances" ADD COLUMN "penaltyAmountVnd" bigint;--> statement-breakpoint
ALTER TABLE "taskInstances" ADD COLUMN "penaltySource" "task_penalty_source";--> statement-breakpoint
ALTER TABLE "taskInstances" ADD COLUMN "penaltyPolicyPublicId" varchar(12);--> statement-breakpoint
ALTER TABLE "taskInstances" ADD COLUMN "penaltySnapshottedAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taskMasters" ADD COLUMN "priority" "task_penalty_priority";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_master_penalty_policies" ADD CONSTRAINT "task_master_penalty_policies_taskMasterId_taskMasters_id_fk" FOREIGN KEY ("taskMasterId") REFERENCES "public"."taskMasters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_master_penalty_policies" ADD CONSTRAINT "task_master_penalty_policies_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_penalty_assessments" ADD CONSTRAINT "task_penalty_assessments_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_penalty_policies" ADD CONSTRAINT "task_penalty_policies_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_master_penalty_policy_master_effective_idx" ON "task_master_penalty_policies" USING btree ("taskMasterId","effectiveFrom");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_penalty_assessment_instance_idx" ON "task_penalty_assessments" USING btree ("taskInstanceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_penalty_policy_priority_effective_idx" ON "task_penalty_policies" USING btree ("priority","effectiveFrom");
--> statement-breakpoint
INSERT INTO "task_penalty_policies" ("publicId", "priority", "amountVnd", "source", "effectiveFrom")
VALUES
  ('sysdefaulthi', 'high', 200000, 'system_default', date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'),
  ('sysdefaultme', 'medium', 100000, 'system_default', date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh'),
  ('sysdefaultlo', 'low', 50000, 'system_default', date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')
ON CONFLICT ("publicId") DO NOTHING;
