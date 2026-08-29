ALTER TABLE "task_penalty_policies" DROP CONSTRAINT "task_penalty_policy_active_requires_end_check";--> statement-breakpoint

WITH ranked_global_policies AS (
  SELECT "id", row_number() OVER (PARTITION BY "priority" ORDER BY "revision" DESC, "createdAt" DESC, "effectiveFrom" DESC, "id" DESC) AS row_number
  FROM "task_penalty_policies"
  WHERE "source" = 'global_policy' AND "supersededAt" IS NULL
)
UPDATE "task_penalty_policies" AS policy SET "supersededAt" = now()
FROM ranked_global_policies AS ranked
WHERE policy."id" = ranked."id" AND ranked.row_number > 1;--> statement-breakpoint

WITH current_global_policies AS (
  SELECT DISTINCT ON ("priority") "priority", "publicId", "amountVnd", "source", "effectiveFrom"
  FROM "task_penalty_policies" WHERE "source" = 'global_policy' AND "supersededAt" IS NULL
  ORDER BY "priority", "revision" DESC, "createdAt" DESC, "effectiveFrom" DESC, "id" DESC
), fallback_policies AS (
  SELECT DISTINCT ON ("priority") "priority", "publicId", "amountVnd", "source", "effectiveFrom"
  FROM "task_penalty_policies" WHERE "source" = 'system_default'
  ORDER BY "priority", "revision" DESC, "createdAt" DESC, "effectiveFrom" DESC, "id" DESC
), resolved_policies AS (
  SELECT * FROM current_global_policies
  UNION ALL SELECT fallback.* FROM fallback_policies AS fallback
  WHERE NOT EXISTS (SELECT 1 FROM current_global_policies AS current WHERE current."priority" = fallback."priority")
)
UPDATE "taskInstances" AS instance SET
  "penaltyPriority" = master."priority",
  "penaltyAmountVnd" = CASE WHEN master."priority" IS NULL THEN NULL WHEN master."penaltyOverrideAmountVnd" IS NOT NULL THEN master."penaltyOverrideAmountVnd" ELSE resolved."amountVnd" END,
  "penaltySource" = CASE WHEN master."priority" IS NULL OR resolved."publicId" IS NULL THEN NULL WHEN master."penaltyOverrideAmountVnd" IS NOT NULL THEN 'master_override'::"task_penalty_source" ELSE resolved."source" END,
  "penaltyPolicyPublicId" = resolved."publicId",
  "penaltySnapshottedAt" = CASE WHEN master."priority" IS NULL OR resolved."publicId" IS NULL THEN NULL ELSE now() END
FROM "taskMasters" AS master LEFT JOIN resolved_policies AS resolved ON resolved."priority" = master."priority"
WHERE instance."taskMasterId" = master."id" AND instance."isDeleted" = false;--> statement-breakpoint

INSERT INTO "task_penalty_assessments" ("publicId", "taskInstanceId", "amountVnd", "source", "policyPublicId", "status", "voidedAt", "updatedAt")
SELECT substring(replace(uuid_generate_v4()::text, '-', '') FROM 1 FOR 12), instance."id", instance."penaltyAmountVnd", instance."penaltySource", instance."penaltyPolicyPublicId", 'active', NULL, now()
FROM "taskInstances" AS instance
WHERE instance."isDeleted" = false AND instance."status" = 'missed' AND instance."penaltyAmountVnd" IS NOT NULL AND instance."penaltySource" IS NOT NULL
ON CONFLICT ("taskInstanceId") DO UPDATE SET "amountVnd" = EXCLUDED."amountVnd", "source" = EXCLUDED."source", "policyPublicId" = EXCLUDED."policyPublicId", "status" = 'active', "voidedAt" = NULL, "updatedAt" = now();--> statement-breakpoint

UPDATE "task_penalty_assessments" AS assessment SET "status" = 'voided', "voidedAt" = now(), "updatedAt" = now()
WHERE assessment."status" = 'active' AND NOT EXISTS (
  SELECT 1 FROM "taskInstances" AS instance
  WHERE instance."id" = assessment."taskInstanceId" AND instance."isDeleted" = false AND instance."status" = 'missed' AND instance."penaltyAmountVnd" IS NOT NULL
);
