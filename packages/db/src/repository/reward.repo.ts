import { eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { cardRewardConfigs, cardRewardDeductions } from "@kan/db/schema";

/**
 * Copy reward template from task master onto a new task instance (draft).
 * Returns new config id, existing instance config id, or null if no template exists.
 */
export async function cloneMasterRewardTemplateToInstance(
  db: dbClient,
  params: {
    taskMasterId: string;
    taskInstanceId: string;
    createdBy: string;
  },
): Promise<number | null> {
  const existingInstance = await db.query.cardRewardConfigs.findFirst({
    where: eq(cardRewardConfigs.taskInstanceId, params.taskInstanceId),
    columns: { id: true },
  });
  if (existingInstance) {
    return existingInstance.id;
  }

  const masterConfig = await db.query.cardRewardConfigs.findFirst({
    where: eq(cardRewardConfigs.taskMasterId, params.taskMasterId),
    with: {
      deductions: {
        orderBy: (d, { asc }) => [asc(d.displayOrder)],
      },
    },
  });

  if (!masterConfig) {
    return null;
  }

  const now = new Date();

  return await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(cardRewardConfigs)
      .values({
        taskInstanceId: params.taskInstanceId,
        rewardType: masterConfig.rewardType,
        bonusAmount: masterConfig.bonusAmount,
        currency: masterConfig.currency,
        approvalStatus: "draft",
        createdBy: params.createdBy,
        createdAt: now,
      })
      .returning({ id: cardRewardConfigs.id });

    if (!created) {
      throw new Error("Failed to clone reward config to task instance");
    }

    const configId = created.id;

    if (masterConfig.deductions.length > 0) {
      await tx.insert(cardRewardDeductions).values(
        masterConfig.deductions.map((d) => ({
          configId,
          reason: d.reason,
          unitType: d.unitType,
          value: d.value,
          displayOrder: d.displayOrder,
          createdAt: now,
        })),
      );
    }

    return configId;
  });
}
