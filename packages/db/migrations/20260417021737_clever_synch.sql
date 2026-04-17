-- Bước 1: Tạo enum mới
CREATE TYPE "public"."rewardApprovalStatus" AS ENUM(
  'draft', 'waiting_approval', 'approved', 'rejected', 'waiting_evaluation', 'completed'
);--> statement-breakpoint

-- Bước 2: Drop default và convert TẤT CẢ column dùng statusType về text
ALTER TABLE "card_reward_configs" ALTER COLUMN "approvalStatus" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "card_reward_configs" ALTER COLUMN "approvalStatus" SET DATA TYPE text;--> statement-breakpoint

ALTER TABLE "public"."card" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."card" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint

ALTER TABLE "public"."taskInstances" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "public"."taskInstances" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint

-- Bước 3: Drop được (không còn default nào phụ thuộc)
DROP TYPE "public"."statusType";--> statement-breakpoint

-- Bước 4: Tạo lại statusType
CREATE TYPE "public"."statusType" AS ENUM('pending', 'done', 'missed');--> statement-breakpoint

-- Bước 5: Cast về đúng type và set lại default
ALTER TABLE "public"."card" 
  ALTER COLUMN "status" SET DATA TYPE "public"."statusType" 
  USING "status"::"public"."statusType";--> statement-breakpoint
ALTER TABLE "public"."card" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint

ALTER TABLE "public"."taskInstances" 
  ALTER COLUMN "status" SET DATA TYPE "public"."statusType" 
  USING "status"::"public"."statusType";--> statement-breakpoint
ALTER TABLE "public"."taskInstances" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint

ALTER TABLE "card_reward_configs" 
  ALTER COLUMN "approvalStatus" SET DATA TYPE "public"."rewardApprovalStatus" 
  USING "approvalStatus"::"public"."rewardApprovalStatus";--> statement-breakpoint

-- Set lại default
ALTER TABLE "card_reward_configs" ALTER COLUMN "approvalStatus" SET DEFAULT 'draft';--> statement-breakpoint
