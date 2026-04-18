ALTER TABLE "taskInstances" ADD COLUMN "endDate" timestamp;

UPDATE "taskInstances" ti
SET "endDate" = (
  ti."targetDate"::date + 
  (tm."endDate"::time)
)
FROM "taskMasters" tm
WHERE ti."taskMasterId" = tm.id
  AND ti."endDate" IS NULL;