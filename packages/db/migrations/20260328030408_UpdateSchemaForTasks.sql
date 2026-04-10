CREATE TYPE "public"."file_activity_type" AS ENUM('file_uploaded', 'file_deleted', 'file_replaced');--> statement-breakpoint
CREATE TYPE "public"."statusType" AS ENUM('pending', 'done', 'missed');--> statement-breakpoint
ALTER TABLE "public"."card_activity" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
UPDATE "public"."card_activity" SET "type" = CASE 
  WHEN "type" = 'card.created' THEN 'created'
  WHEN "type" = 'card.updated.title' THEN 'updated_title'
  WHEN "type" = 'card.updated.description' THEN 'updated_description'
  WHEN "type" = 'card.updated.list' THEN 'updated_list'
  WHEN "type" = 'card.updated.member.added' THEN 'member_assigned'
  WHEN "type" = 'card.updated.member.removed' THEN 'member_unassigned'
  WHEN "type" = 'card.updated.dueDate.updated' THEN 'deadline_changed'
  WHEN "type" = 'card.updated.dueDate.added' THEN 'deadline_changed'
  WHEN "type" = 'card.updated.dueDate.removed' THEN 'deadline_changed'
  WHEN "type" = 'card.updated.comment.added' THEN 'comment'
  ELSE 'created'
END;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."card_activity_type";--> statement-breakpoint
CREATE TYPE "public"."card_activity_type" AS ENUM('created', 'updated_title', 'updated_description', 'updated_list', 'status_changed', 'member_assigned', 'member_unassigned', 'deadline_changed', 'comment');--> statement-breakpoint
ALTER TABLE "public"."card_activity" ALTER COLUMN "type" SET DATA TYPE "public"."card_activity_type" USING "type"::"public"."card_activity_type";--> statement-breakpoint
ALTER TABLE "public"."workspace_members" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
UPDATE "public"."workspace_members" SET "role" = CASE 
  WHEN "role" = 'admin' THEN 'ADMIN'
  ELSE 'NVVP'
END;--> statement-breakpoint
DROP TYPE IF EXISTS "public"."role";--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'NVKT_MANAGER', 'NVKD_MANAGER', 'NVVP');--> statement-breakpoint
ALTER TABLE "public"."workspace_members" ALTER COLUMN "role" SET DATA TYPE "public"."role" USING "role"::"public"."role";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"comment" text NOT NULL,
	"cardId" bigint,
	"taskInstanceId" uuid,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "comments_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "file_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"taskInstanceId" uuid,
	"cardId" bigint,
	"activityType" "file_activity_type" NOT NULL,
	"fileName" varchar(255),
	"oldFileUrl" varchar(500),
	"newFileUrl" varchar(500),
	"fileSize" bigint,
	"mimeType" varchar(100),
	"metadata" text,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "frequence" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" varchar(255) NOT NULL,
	"rruleString" text,
	"dtStart" timestamp,
	"createAt" timestamp DEFAULT now() NOT NULL,
	"updateAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taskInstances" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"userId" uuid NOT NULL,
	"taskMasterId" uuid NOT NULL,
	"targetDate" timestamp,
	"actualDate" timestamp,
	"status" "statusType" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "taskInstances_userId_taskMasterId_targetDate_unique" UNIQUE("userId","taskMasterId","targetDate")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "taskMasters" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"freqId" uuid NOT NULL,
	"name" varchar(255),
	"description" text,
	"startDate" timestamp NOT NULL,
	"endDate" timestamp NOT NULL,
	"targetUser" uuid NOT NULL,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "card_comments" CASCADE;--> statement-breakpoint
ALTER TABLE "card_activity" DROP CONSTRAINT IF EXISTS "card_activity_commentId_card_comments_id_fk";
--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT IF EXISTS "notification_commentId_card_comments_id_fk";
--> statement-breakpoint
ALTER TABLE "card_activity" ALTER COLUMN "cardId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "taskInstanceId" uuid;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "oldValue" text;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "newValue" text;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "targetUser" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" "role" DEFAULT 'NVVP' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "branchId" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "areaId" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "isActive" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comments" ADD CONSTRAINT "comments_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taskInstances" ADD CONSTRAINT "taskInstances_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taskInstances" ADD CONSTRAINT "taskInstances_taskMasterId_taskMasters_id_fk" FOREIGN KEY ("taskMasterId") REFERENCES "public"."taskMasters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taskMasters" ADD CONSTRAINT "taskMasters_freqId_frequence_id_fk" FOREIGN KEY ("freqId") REFERENCES "public"."frequence"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taskMasters" ADD CONSTRAINT "taskMasters_targetUser_user_id_fk" FOREIGN KEY ("targetUser") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "taskMasters" ADD CONSTRAINT "taskMasters_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_activity_task_instance_idx" ON "file_activity_log" USING btree ("taskInstanceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_activity_card_idx" ON "file_activity_log" USING btree ("cardId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_activity_type_idx" ON "file_activity_log" USING btree ("activityType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "file_activity_created_at_idx" ON "file_activity_log" USING btree ("createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_instances_user_target_idx" ON "taskInstances" USING btree ("userId","targetDate");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_instances_master_idx" ON "taskInstances" USING btree ("taskMasterId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_commentId_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_targetUser_user_id_fk" FOREIGN KEY ("targetUser") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification" ADD CONSTRAINT "notification_commentId_comments_id_fk" FOREIGN KEY ("commentId") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "card_activity" ADD CONSTRAINT chk_card_activity_entity CHECK (
  ("taskInstanceId" IS NOT NULL AND "cardId" IS NULL) OR
  ("taskInstanceId" IS NULL AND "cardId" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT chk_comments_entity CHECK (
  ("taskInstanceId" IS NOT NULL AND "cardId" IS NULL) OR
  ("taskInstanceId" IS NULL AND "cardId" IS NOT NULL)
);--> statement-breakpoint
ALTER TABLE "file_activity_log" ADD CONSTRAINT chk_file_activity_log_entity CHECK (
  ("taskInstanceId" IS NOT NULL AND "cardId" IS NULL) OR
  ("taskInstanceId" IS NULL AND "cardId" IS NOT NULL)
);