-- 1. Drop constraint cũ
ALTER TABLE "card_reward_configs" DROP CONSTRAINT "card_reward_configs_xor_source";

-- 2. Drop cột cũ
ALTER TABLE "card_reward_configs" DROP COLUMN "taskMasterId";

-- 3. Thêm cột mới
ALTER TABLE "card_reward_configs" ADD COLUMN "taskInstanceId" uuid;

-- 4. Xóa logs của các configs sắp bị xóa trước
DELETE FROM "card_reward_logs"
WHERE "configId" IN (
  SELECT id FROM "card_reward_configs" WHERE "cardId" IS NULL
);

-- 5. Xóa các bảng con khác cũng FK vào config (nếu có)
DELETE FROM "card_reward_deductions"
WHERE "configId" IN (
  SELECT id FROM "card_reward_configs" WHERE "cardId" IS NULL
);

DELETE FROM "card_reward_snapshots"
WHERE "configId" IN (
  SELECT id FROM "card_reward_configs" WHERE "cardId" IS NULL
);

DELETE FROM "card_reward_finalizations"
WHERE "configId" IN (
  SELECT id FROM "card_reward_configs" WHERE "cardId" IS NULL
);

-- 6. Bây giờ mới xóa configs
DELETE FROM "card_reward_configs" WHERE "cardId" IS NULL;

-- 7. Add FK + unique
ALTER TABLE "card_reward_configs"
  ADD CONSTRAINT "card_reward_configs_taskInstanceId_taskInstances_id_fk"
  FOREIGN KEY ("taskInstanceId") REFERENCES "taskInstances"("id")
  ON DELETE no action ON UPDATE no action;

ALTER TABLE "card_reward_configs"
  ADD CONSTRAINT "card_reward_configs_taskInstanceId_unique"
  UNIQUE("taskInstanceId");

-- 8. Add constraint mới
ALTER TABLE "card_reward_configs"
  ADD CONSTRAINT "card_reward_configs_xor_source" CHECK (
    (("taskInstanceId" IS NOT NULL) AND ("cardId" IS NULL)) OR
    (("taskInstanceId" IS NULL) AND ("cardId" IS NOT NULL))
  );