ALTER TABLE "card_activity" ADD COLUMN "taskMasterId" uuid;--> statement-breakpoint
ALTER TABLE "card_activity" ADD COLUMN "freqId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_taskMasterId_taskMasters_id_fk" FOREIGN KEY ("taskMasterId") REFERENCES "public"."taskMasters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_activity" ADD CONSTRAINT "card_activity_freqId_frequence_id_fk" FOREIGN KEY ("freqId") REFERENCES "public"."frequence"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
