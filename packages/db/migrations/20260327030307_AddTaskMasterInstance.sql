CREATE TYPE "public"."task_instance_status" AS ENUM('pending', 'in_progress', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_instances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"masterId" bigint NOT NULL,
	"targetDate" date NOT NULL,
	"status" "task_instance_status" DEFAULT 'pending' NOT NULL,
	"actualStartAt" timestamp,
	"actualEndAt" timestamp,
	"note" text,
	"cardId" bigint,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "task_instances_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_masters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"recurrenceRule" jsonb NOT NULL,
	"defaultStartTime" varchar(5),
	"defaultEndTime" varchar(5),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	CONSTRAINT "task_masters_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_masterId_task_masters_id_fk" FOREIGN KEY ("masterId") REFERENCES "public"."task_masters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_instances" ADD CONSTRAINT "task_instances_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_masters" ADD CONSTRAINT "task_masters_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_masters" ADD CONSTRAINT "task_masters_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_instances_master_date_idx" ON "task_instances" USING btree ("masterId","targetDate");