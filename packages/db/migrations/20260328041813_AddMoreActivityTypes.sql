ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_index' BEFORE 'status_changed';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_comment_added';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_comment_updated';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_comment_deleted';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_added';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_renamed';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_deleted';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_item_added';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_item_updated';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_item_completed';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_item_uncompleted';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_checklist_item_deleted';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_attachment_added';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_attachment_removed';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_label_added';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_label_removed';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'archived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE 'updated_attachment_renamed';