CREATE TYPE "public"."board_mode" AS ENUM('classic', 'project');--> statement-breakpoint
CREATE TYPE "public"."project_board_member_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_board_member" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"boardId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	"role" "project_board_member_role" DEFAULT 'viewer' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "project_board_member_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "project_board_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_card_member" (
	"cardId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_card_member_cardId_workspaceMemberId_pk" PRIMARY KEY("cardId","workspaceMemberId")
);
--> statement-breakpoint
ALTER TABLE "project_card_member" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "mode" "board_mode" DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "parentCardId" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_parentCardId_card_id_fk" FOREIGN KEY ("parentCardId") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board_member" ADD CONSTRAINT "project_board_member_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board_member" ADD CONSTRAINT "project_board_member_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_board_member" ADD CONSTRAINT "project_board_member_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_card_member" ADD CONSTRAINT "project_card_member_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_card_member" ADD CONSTRAINT "project_card_member_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_board_member_unique_idx" ON "project_board_member" USING btree ("boardId","workspaceMemberId") WHERE "project_board_member"."deletedAt" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_board_member_board_idx" ON "project_board_member" USING btree ("boardId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_board_member_workspace_member_idx" ON "project_board_member" USING btree ("workspaceMemberId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_card_member_card_idx" ON "project_card_member" USING btree ("cardId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_card_member_workspace_member_idx" ON "project_card_member" USING btree ("workspaceMemberId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "card_parent_idx" ON "card" USING btree ("parentCardId");
