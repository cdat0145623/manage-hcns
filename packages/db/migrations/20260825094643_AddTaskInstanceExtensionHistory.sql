ALTER TYPE "public"."card_activity_type" ADD VALUE 'deadline_extended' BEFORE 'member_assigned';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_instance_extensions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"taskInstanceId" uuid NOT NULL,
	"previousEndDate" timestamp with time zone NOT NULL,
	"newEndDate" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"extendedBy" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_instance_extensions_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "taskInstanceExtensionId" uuid;--> statement-breakpoint
ALTER TABLE "taskInstances" ADD COLUMN "originalEndDate" timestamp with time zone;--> statement-breakpoint
UPDATE "taskInstances"
SET "originalEndDate" = "endDate"
WHERE "originalEndDate" IS NULL AND "endDate" IS NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instance_extensions" ADD CONSTRAINT "task_instance_extensions_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instance_extensions" ADD CONSTRAINT "task_instance_extensions_extendedBy_user_id_fk" FOREIGN KEY ("extendedBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_instance_extensions_instance_created_idx" ON "task_instance_extensions" USING btree ("taskInstanceId","createdAt");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_taskInstanceExtensionId_task_instance_extensions_id_fk" FOREIGN KEY ("taskInstanceExtensionId") REFERENCES "public"."task_instance_extensions"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
