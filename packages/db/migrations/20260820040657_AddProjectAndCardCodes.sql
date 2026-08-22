ALTER TABLE "board" ADD COLUMN "projectCode" varchar(10);--> statement-breakpoint
ALTER TABLE "board" ADD COLUMN "nextCardNumber" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "cardNumber" integer;--> statement-breakpoint
UPDATE "board"
SET "projectCode" = COALESCE(
  NULLIF(UPPER(LEFT(REGEXP_REPLACE("name", '[^a-zA-Z0-9]', '', 'g'), 10)), ''),
  'PRJ'
)
WHERE "mode" = 'project' AND "projectCode" IS NULL;--> statement-breakpoint
WITH numbered_cards AS (
  SELECT
    c."id",
    ROW_NUMBER() OVER (
      PARTITION BY b."id"
      ORDER BY c."createdAt", c."id"
    )::integer AS card_number
  FROM "card" c
  INNER JOIN "list" l ON l."id" = c."listId"
  INNER JOIN "board" b ON b."id" = l."boardId"
  WHERE b."mode" = 'project'
)
UPDATE "card" c
SET "cardNumber" = numbered_cards.card_number
FROM numbered_cards
WHERE c."id" = numbered_cards."id";--> statement-breakpoint
UPDATE "board" b
SET "nextCardNumber" = COALESCE(
  (
    SELECT MAX(c."cardNumber") + 1
    FROM "card" c
    INNER JOIN "list" l ON l."id" = c."listId"
    WHERE l."boardId" = b."id"
  ),
  1
)
WHERE b."mode" = 'project';
