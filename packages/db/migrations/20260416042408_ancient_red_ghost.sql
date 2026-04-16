CREATE TYPE "public"."deductionUnit" AS ENUM('percent', 'vnd');--> statement-breakpoint
CREATE TYPE "public"."rewardType" AS ENUM('project', 'responsibility');--> statement-breakpoint
CREATE TYPE "public"."rewardViolationType" AS ENUM('deadline_extended', 'deadline_shortened', 'start_date_changed', 'assignee_changed');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "card_reward_configs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"cardId" bigint NOT NULL,
	"rewardType" "rewardType" NOT NULL,
	"bonusAmount" numeric(15, 2),
	"currency" varchar(3) DEFAULT 'VND' NOT NULL,
	"approvalStatus" "statusType" DEFAULT 'draft' NOT NULL,
	"approvedBy" uuid,
	"approvedAt" timestamp (6),
	"rejectedReason" text,
	"createdBy" uuid NOT NULL,
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (6),
	CONSTRAINT "card_reward_configs_cardId_unique" UNIQUE("cardId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_reward_deductions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"configId" bigint NOT NULL,
	"reason" varchar(500) NOT NULL,
	"unitType" "deductionUnit" NOT NULL,
	"value" numeric(15, 2) NOT NULL,
	"displayOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (6) DEFAULT now() NOT NULL,
	"updatedAt" timestamp (6)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_reward_finalizations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"configId" bigint NOT NULL,
	"completionPercent" numeric(5, 2) NOT NULL,
	"suggestedAmount" numeric(15, 2) NOT NULL,
	"finalAmount" numeric(15, 2) NOT NULL,
	"finalNote" text,
	"finalizedBy" uuid NOT NULL,
	"finalizedAt" timestamp (6) DEFAULT now() NOT NULL,
	CONSTRAINT "card_reward_finalizations_configId_unique" UNIQUE("configId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_reward_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"configId" bigint NOT NULL,
	"violationType" "rewardViolationType" NOT NULL,
	"beforeValue" jsonb NOT NULL,
	"afterValue" jsonb NOT NULL,
	"detectedAt" timestamp (6) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "card_reward_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"configId" bigint NOT NULL,
	"snappedCardTitle" text NOT NULL,
	"snappedStartDate" timestamp (6),
	"snappedDueDate" timestamp (6),
	"snappedTargetUser" uuid,
	"snappedRewardType" "rewardType" NOT NULL,
	"snappedBonusAmount" numeric(15, 2),
	"snappedCurrency" varchar(3) NOT NULL,
	"snappedDeductions" jsonb NOT NULL,
	"snapshotAt" timestamp (6) DEFAULT now() NOT NULL,
	"snapshotBy" uuid NOT NULL,
	CONSTRAINT "card_reward_snapshots_configId_unique" UNIQUE("configId")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_cardId_card_id_fk" FOREIGN KEY ("cardId") REFERENCES "public"."card"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_approvedBy_user_id_fk" FOREIGN KEY ("approvedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_configs" ADD CONSTRAINT "card_reward_configs_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_deductions" ADD CONSTRAINT "card_reward_deductions_configId_card_reward_configs_id_fk" FOREIGN KEY ("configId") REFERENCES "public"."card_reward_configs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_finalizations" ADD CONSTRAINT "card_reward_finalizations_configId_card_reward_configs_id_fk" FOREIGN KEY ("configId") REFERENCES "public"."card_reward_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_finalizations" ADD CONSTRAINT "card_reward_finalizations_finalizedBy_user_id_fk" FOREIGN KEY ("finalizedBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_logs" ADD CONSTRAINT "card_reward_logs_configId_card_reward_configs_id_fk" FOREIGN KEY ("configId") REFERENCES "public"."card_reward_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_snapshots" ADD CONSTRAINT "card_reward_snapshots_configId_card_reward_configs_id_fk" FOREIGN KEY ("configId") REFERENCES "public"."card_reward_configs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card_reward_snapshots" ADD CONSTRAINT "card_reward_snapshots_snapshotBy_user_id_fk" FOREIGN KEY ("snapshotBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
