-- Drop constraint cũ (an toàn nếu đã xoá trước đó)
ALTER TABLE "card_activity"
DROP CONSTRAINT IF EXISTS chk_card_activity_entity;

-- Add constraint mới
ALTER TABLE "card_activity"
ADD CONSTRAINT chk_card_activity_entity
CHECK (
  (
    ("cardId" IS NOT NULL)::int +
    ("taskInstanceId" IS NOT NULL)::int +
    ("taskMasterId" IS NOT NULL)::int +
    ("freqId" IS NOT NULL)::int +
    ("workspaceMemberId" IS NOT NULL)::int
  ) <= 2
);