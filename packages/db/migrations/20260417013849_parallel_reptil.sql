ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_reward_config';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_deduction';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'created_finalization';--> statement-breakpoint
ALTER TYPE "public"."rewardViolationType" ADD VALUE 'reward_config_changed';--> statement-breakpoint
ALTER TYPE "public"."rewardViolationType" ADD VALUE 'deduction_changed';--> statement-breakpoint
ALTER TYPE "public"."rewardViolationType" ADD VALUE 'finalization_created';