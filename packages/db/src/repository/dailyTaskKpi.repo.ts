import { and, eq, gte, isNull, lte } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { dailyTaskKpiExclusions } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export const DEFAULT_DAILY_TASK_KPI_EXCLUSION_REASON =
  "Không áp dụng KPI cho task này.";

export interface DailyTaskKpiOccurrenceInput {
  taskMasterId: string;
  occurrenceDate: string;
  reason?: string;
}

export interface DailyTaskKpiOccurrenceKey {
  taskMasterId: string;
  occurrenceDate: string;
}

export const getDailyTaskKpiExclusions = async (
  db: dbClient,
  input: { targetUserId: string; from: string; to: string },
) =>
  db
    .select({
      taskMasterId: dailyTaskKpiExclusions.taskMasterId,
      occurrenceDate: dailyTaskKpiExclusions.occurrenceDate,
      reason: dailyTaskKpiExclusions.reason,
    })
    .from(dailyTaskKpiExclusions)
    .where(
      and(
        eq(dailyTaskKpiExclusions.targetUserId, input.targetUserId),
        gte(dailyTaskKpiExclusions.occurrenceDate, input.from),
        lte(dailyTaskKpiExclusions.occurrenceDate, input.to),
        isNull(dailyTaskKpiExclusions.deletedAt),
      ),
    );

export const saveDailyTaskKpiExclusionChanges = async (
  db: dbClient,
  input: {
    targetUserId: string;
    actorUserId: string;
    exclude: DailyTaskKpiOccurrenceInput[];
    include: DailyTaskKpiOccurrenceKey[];
  },
) => {
  const excludedKeys = new Set(
    input.exclude.map((item) => `${item.taskMasterId}:${item.occurrenceDate}`),
  );
  const inclusions = input.include.filter(
    (item) => !excludedKeys.has(`${item.taskMasterId}:${item.occurrenceDate}`),
  );

  await db.transaction(async (tx) => {
    await Promise.all(
      input.exclude.map((item) =>
        tx
          .insert(dailyTaskKpiExclusions)
          .values({
            publicId: generateUID(),
            taskMasterId: item.taskMasterId,
            targetUserId: input.targetUserId,
            occurrenceDate: item.occurrenceDate,
            reason:
              item.reason?.trim() || DEFAULT_DAILY_TASK_KPI_EXCLUSION_REASON,
            excludedByUserId: input.actorUserId,
          })
          .onConflictDoUpdate({
            target: [
              dailyTaskKpiExclusions.taskMasterId,
              dailyTaskKpiExclusions.targetUserId,
              dailyTaskKpiExclusions.occurrenceDate,
            ],
            set: {
              reason:
                item.reason?.trim() || DEFAULT_DAILY_TASK_KPI_EXCLUSION_REASON,
              excludedByUserId: input.actorUserId,
              updatedAt: new Date(),
              deletedAt: null,
              deletedByUserId: null,
            },
          }),
      ),
    );

    await Promise.all(
      inclusions.map((item) =>
        tx
          .update(dailyTaskKpiExclusions)
          .set({
            updatedAt: new Date(),
            deletedAt: new Date(),
            deletedByUserId: input.actorUserId,
          })
          .where(
            and(
              eq(dailyTaskKpiExclusions.taskMasterId, item.taskMasterId),
              eq(dailyTaskKpiExclusions.targetUserId, input.targetUserId),
              eq(dailyTaskKpiExclusions.occurrenceDate, item.occurrenceDate),
              isNull(dailyTaskKpiExclusions.deletedAt),
            ),
          ),
      ),
    );
  });
};
