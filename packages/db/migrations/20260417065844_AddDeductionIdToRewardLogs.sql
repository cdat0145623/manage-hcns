ALTER TABLE "card_reward_logs" ADD COLUMN "deductionId" bigint;--> statement-breakpoint
ALTER TABLE "card_reward_logs" ADD COLUMN "isSkipped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_logs" ADD CONSTRAINT "card_reward_logs_deductionId_card_reward_deductions_id_fk" FOREIGN KEY ("deductionId") REFERENCES "public"."card_reward_deductions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
