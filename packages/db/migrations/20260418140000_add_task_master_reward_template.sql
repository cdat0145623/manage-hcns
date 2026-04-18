-- Reward template on task master: exactly one of cardId | taskInstanceId | taskMasterId
ALTER TABLE "card_reward_configs" ADD COLUMN IF NOT EXISTS "taskMasterId" uuid;

DO $$ BEGIN
 ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_taskMasterId_taskMasters_id_fk"
   FOREIGN KEY ("taskMasterId") REFERENCES "public"."taskMasters"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_taskMasterId_unique" UNIQUE ("taskMasterId");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "card_reward_configs" DROP CONSTRAINT IF EXISTS "card_reward_configs_xor_source";

ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_xor_source" CHECK (
  (("cardId" IS NOT NULL)::int + ("taskInstanceId" IS NOT NULL)::int + ("taskMasterId" IS NOT NULL)::int) = 1
);
