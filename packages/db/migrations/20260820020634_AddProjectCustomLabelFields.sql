CREATE TYPE "public"."project_label_selection_mode" AS ENUM('single', 'multiple');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_label_field" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"boardId" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"selectionMode" "project_label_selection_mode" DEFAULT 'multiple' NOT NULL,
	"index" integer DEFAULT 0 NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "project_label_field_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "project_label_field" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "label" ADD COLUMN "projectLabelFieldId" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_label_field" ADD CONSTRAINT "project_label_field_boardId_board_id_fk" FOREIGN KEY ("boardId") REFERENCES "public"."board"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_label_field" ADD CONSTRAINT "project_label_field_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_label_field" ADD CONSTRAINT "project_label_field_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_label_field_board_idx" ON "project_label_field" USING btree ("boardId");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "label" ADD CONSTRAINT "label_projectLabelFieldId_project_label_field_id_fk" FOREIGN KEY ("projectLabelFieldId") REFERENCES "public"."project_label_field"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
INSERT INTO "project_label_field" ("publicId", "boardId", "name", "selectionMode", "index", "createdBy")
SELECT substr(md5(random()::text || b."id"::text), 1, 12), b."id", 'Nhãn', 'multiple', 0, b."createdBy"
FROM "board" b
WHERE b."mode" = 'project'
  AND EXISTS (
    SELECT 1
    FROM "label" l
    WHERE l."boardId" = b."id"
      AND l."deletedAt" IS NULL
      AND l."projectLabelFieldId" IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "project_label_field" f
    WHERE f."boardId" = b."id"
      AND f."deletedAt" IS NULL
  );
--> statement-breakpoint
UPDATE "label" l
SET "projectLabelFieldId" = f."id"
FROM "project_label_field" f
JOIN "board" b ON b."id" = f."boardId"
WHERE l."boardId" = f."boardId"
  AND l."projectLabelFieldId" IS NULL
  AND l."deletedAt" IS NULL
  AND b."mode" = 'project';
