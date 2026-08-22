CREATE TYPE "public"."project_cycle_status" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."project_estimation_type" AS ENUM('none', 'story_points', 'hours');--> statement-breakpoint
CREATE TYPE "public"."project_workflow_type" AS ENUM('general', 'scrum');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_board_settings" (
	"boardId" bigint PRIMARY KEY NOT NULL,
	"workflowType" "project_workflow_type" DEFAULT 'general' NOT NULL,
	"estimationType" "project_estimation_type" DEFAULT 'none' NOT NULL,
	"enableCycles" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "project_board_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_card_planning" (
	"cardId" bigint PRIMARY KEY NOT NULL,
	"cycleId" bigint,
	"estimateValue" numeric(10, 2),
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "project_card_planning" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_cycle_card" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cycleId" bigint NOT NULL,
	"cardId" bigint NOT NULL,
	"estimateSnapshot" numeric(10, 2),
	"assignedAt" timestamp DEFAULT now() NOT NULL,
	"removedAt" timestamp,
	"completedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "project_cycle_card" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_cycle" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"boardId" bigint NOT NULL,
	"name" varchar(255) NOT NULL,
	"goal" varchar(2000),
	"startsAt" timestamp,
	"endsAt" timestamp,
	"status" "project_cycle_status" DEFAULT 'planned' NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"completedAt" timestamp,
	CONSTRAINT "project_cycle_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "project_cycle" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_list_settings" (
	"listId" bigint PRIMARY KEY NOT NULL,
	"isCompletionColumn" boolean DEFAULT false NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "project_list_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "project_board_settings" ("boardId")
SELECT "id" FROM "board" WHERE "mode" = 'project'
ON CONFLICT ("boardId") DO NOTHING;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board_settings" ADD CONSTRAINT "project_board_settings_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_card_planning" ADD CONSTRAINT "project_card_planning_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_card_planning" ADD CONSTRAINT "project_card_planning_cycleId_project_cycle_id_fk" FOREIGN KEY ("cycleId") REFERENCES "public"."project_cycle"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_cycle_card" ADD CONSTRAINT "project_cycle_card_cycleId_project_cycle_id_fk" FOREIGN KEY ("cycleId") REFERENCES "public"."project_cycle"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_cycle_card" ADD CONSTRAINT "project_cycle_card_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_cycle" ADD CONSTRAINT "project_cycle_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_cycle" ADD CONSTRAINT "project_cycle_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_list_settings" ADD CONSTRAINT "project_list_settings_listId_list_id_fk" FOREIGN KEY ("listId") REFERENCES "public"."list"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_card_planning_cycle_idx" ON "project_card_planning" USING btree ("cycleId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cycle_card_cycle_idx" ON "project_cycle_card" USING btree ("cycleId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cycle_card_card_idx" ON "project_cycle_card" USING btree ("cardId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_cycle_card_active_card_idx" ON "project_cycle_card" USING btree ("cardId") WHERE "project_cycle_card"."removedAt" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cycle_board_idx" ON "project_cycle" USING btree ("boardId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_cycle_status_idx" ON "project_cycle" USING btree ("status");
