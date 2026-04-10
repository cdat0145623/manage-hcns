ALTER TABLE "card_checklist" ALTER COLUMN "cardId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_checklist" ADD COLUMN "taskInstanceId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_checklist" ADD CONSTRAINT "card_checklist_taskInstanceId_taskInstances_id_fk" FOREIGN KEY ("taskInstanceId") REFERENCES "public"."taskInstances"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "card_checklist" ADD CONSTRAINT "card_checklist_entity_check" CHECK ((((("taskInstanceId" IS NOT NULL) AND ("cardId" IS NULL)) OR (("taskInstanceId" IS NULL) AND ("cardId" IS NOT NULL)))));