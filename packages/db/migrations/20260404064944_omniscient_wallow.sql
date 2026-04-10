ALTER TABLE "file_activity_log" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "file_activity_log" ADD COLUMN "deletedBy" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "file_activity_log" ADD CONSTRAINT "file_activity_log_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
