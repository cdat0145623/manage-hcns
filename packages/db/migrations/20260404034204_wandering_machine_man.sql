DROP TABLE IF EXISTS "card_attachment" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "file_activity_log" CASCADE;--> statement-breakpoint
CREATE TABLE "file_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"publicId" varchar(12) NOT NULL,
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
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "file_activity_log_publicId_unique" UNIQUE("publicId")
);--> statement-breakpoint
ALTER TABLE "card_activity" ALTER COLUMN "attachmentId" SET DATA TYPE uuid USING (NULL);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_attachmentId_file_activity_log_id_fk" FOREIGN KEY ("attachmentId") REFERENCES "public"."file_activity_log"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_activity_log" ADD CONSTRAINT chk_file_activity_log_entity CHECK (
  ("taskInstanceId" IS NOT NULL AND "cardId" IS NULL) OR
  ("taskInstanceId" IS NULL AND "cardId" IS NOT NULL)
);