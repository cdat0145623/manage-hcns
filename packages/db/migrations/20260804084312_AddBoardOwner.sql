ALTER TABLE "board" ADD COLUMN "ownerUserId" uuid;--> statement-breakpoint
UPDATE "board" SET "ownerUserId" = "createdBy" WHERE "ownerUserId" IS NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "board" ADD CONSTRAINT "board_ownerUserId_user_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX "board_owner_user_idx" ON "board" USING btree ("ownerUserId");
