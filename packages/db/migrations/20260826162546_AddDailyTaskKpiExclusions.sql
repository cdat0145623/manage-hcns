CREATE TABLE IF NOT EXISTS "daily_task_kpi_exclusions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"taskMasterId" uuid NOT NULL,
	"targetUserId" uuid NOT NULL,
	"occurrenceDate" date NOT NULL,
	"reason" text DEFAULT 'Không áp dụng KPI cho task này.' NOT NULL,
	"excludedByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	"deletedByUserId" uuid,
	CONSTRAINT "daily_task_kpi_exclusions_publicId_unique" UNIQUE("publicId"),
	CONSTRAINT "daily_task_kpi_exclusions_taskMasterId_targetUserId_occurrenceDate_unique" UNIQUE("taskMasterId","targetUserId","occurrenceDate")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_task_kpi_exclusions" ADD CONSTRAINT "daily_task_kpi_exclusions_taskMasterId_taskMasters_id_fk" FOREIGN KEY ("taskMasterId") REFERENCES "public"."taskMasters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_task_kpi_exclusions" ADD CONSTRAINT "daily_task_kpi_exclusions_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_task_kpi_exclusions" ADD CONSTRAINT "daily_task_kpi_exclusions_excludedByUserId_user_id_fk" FOREIGN KEY ("excludedByUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_task_kpi_exclusions" ADD CONSTRAINT "daily_task_kpi_exclusions_deletedByUserId_user_id_fk" FOREIGN KEY ("deletedByUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_task_kpi_exclusions_user_date_active_idx" ON "daily_task_kpi_exclusions" USING btree ("targetUserId","occurrenceDate","deletedAt");
