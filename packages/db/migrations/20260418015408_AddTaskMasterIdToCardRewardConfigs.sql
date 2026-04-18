ALTER TABLE "card_reward_configs" ALTER COLUMN "cardId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "card_reward_configs" ADD COLUMN "taskMasterId" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_taskMasterId_taskMasters_id_fk" FOREIGN KEY ("taskMasterId") REFERENCES "public"."taskMasters"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_taskMasterId_unique" UNIQUE("taskMasterId");--> statement-breakpoint
ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_xor_source" CHECK ((("taskMasterId" IS NOT NULL) AND ("cardId" IS NULL)) OR (("taskMasterId" IS NULL) AND ("cardId" IS NOT NULL)));