import { and, eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import type { taskMasters } from "@kan/db/schema";
import { cardActivities, taskInstances } from "@kan/db/schema";
import { createLogger } from "@kan/logger";
import {
  calendarDateKeyInAppZone,
  generateUID,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

import type { TaskStatus } from "./taskInstance.repo";
import { cloneMasterRewardTemplateToInstance } from "./reward.repo";
import { generateVirtualTaskInstances } from "./taskInstance.repo";
import { loadPenaltySnapshotsForMasters } from "./taskPenaltyPolicy.repo";

const logger = createLogger("task-instance-materializer");

export interface MaterializeTaskInstancesOptions {
  date: string | Date;
  taskMasterId?: string;
  userId?: string;
  dryRun?: boolean;
}

interface MaterializeTaskInstanceError {
  taskMasterId: string;
  message: string;
}

export interface MaterializeTaskInstancesResult {
  created: number;
  skipped: number;
  failed: number;
  errors: MaterializeTaskInstanceError[];
}

const normalizeDateKey = (date: string | Date) => {
  const dateKey =
    date instanceof Date ? calendarDateKeyInAppZone(date) : date.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("date must use YYYY-MM-DD format");
  }

  const parsed = parseCalendarDayInZone(dateKey);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid calendar date: ${dateKey}`);
  }

  return { dateKey, dayStart: parsed };
};

const getNextDayStart = (dayStart: Date) =>
  new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

export const buildTaskMasterMaterializationConditions = (
  taskMaster: Pick<typeof taskMasters, "isDeleted" | "id" | "targetUser">,
  options: Pick<MaterializeTaskInstancesOptions, "taskMasterId" | "userId">,
) => {
  const conditions = [eq(taskMaster.isDeleted, false)];

  if (options.taskMasterId) {
    conditions.push(eq(taskMaster.id, options.taskMasterId));
  }

  if (options.userId) {
    conditions.push(eq(taskMaster.targetUser, options.userId));
  }

  return conditions;
};

export async function materializeTaskInstances(
  db: dbClient,
  options: MaterializeTaskInstancesOptions,
): Promise<MaterializeTaskInstancesResult> {
  const { dayStart, dateKey } = normalizeDateKey(options.date);
  const nextDayStart = getNextDayStart(dayStart);
  const dayEnd = new Date(nextDayStart.getTime() - 1);

  const masters = await db.query.taskMasters.findMany({
    where: (taskMaster) =>
      and(...buildTaskMasterMaterializationConditions(taskMaster, options)),
    with: { frequence: true },
  });

  const result: MaterializeTaskInstancesResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const penaltySnapshots = await loadPenaltySnapshotsForMasters(
    db,
    masters.map((master) => ({
      id: master.id,
      priority: master.priority,
      overrideAmountVnd: master.penaltyOverrideAmountVnd,
    })),
    dayStart,
  );

  for (const master of masters) {
    try {
      const frequency = master.frequence;
      if (!frequency.rruleString || !frequency.dtStart) {
        result.skipped++;
        continue;
      }

      const occurrences = await generateVirtualTaskInstances({
        userId: master.targetUser,
        taskMasterId: master.id,
        rruleString: frequency.rruleString,
        startDate: master.startDate,
        masterEndDate: master.endDate,
        from: dayStart,
        to: dayEnd,
      });

      for (const occurrence of occurrences) {
        const existing = await db.query.taskInstances.findFirst({
          where: (taskInstance) =>
            and(
              eq(taskInstance.userId, master.targetUser),
              eq(taskInstance.taskMasterId, master.id),
              eq(taskInstance.targetDate, occurrence.targetDate),
            ),
        });

        if (existing) {
          if (!options.dryRun) {
            await cloneMasterRewardTemplateToInstance(db, {
              taskMasterId: master.id,
              taskInstanceId: existing.id,
              createdBy: master.targetUser,
            });
          }
          result.skipped++;
          continue;
        }

        if (options.dryRun) {
          result.created++;
          continue;
        }

        const created = await db.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(taskInstances)
            .values({
              userId: master.targetUser,
              taskMasterId: master.id,
              name: master.name,
              description: master.description,
              targetDate: occurrence.targetDate,
              actualDate: null,
              originalEndDate: occurrence.endDate,
              endDate: occurrence.endDate,
              status: "pending" as TaskStatus,
              penaltyPriority: penaltySnapshots.get(master.id)?.priority,
              penaltyAmountVnd: penaltySnapshots.get(master.id)?.amountVnd,
              penaltySource: penaltySnapshots.get(master.id)?.source,
              penaltyPolicyPublicId: penaltySnapshots.get(master.id)
                ?.policyPublicId,
              penaltySnapshottedAt: penaltySnapshots.get(master.id)
                ? new Date()
                : null,
            })
            .onConflictDoNothing({
              target: [
                taskInstances.userId,
                taskInstances.taskMasterId,
                taskInstances.targetDate,
              ],
            })
            .returning({ id: taskInstances.id });

          if (!inserted) return undefined;

          await tx.insert(cardActivities).values({
            publicId: generateUID(),
            taskInstanceId: inserted.id,
            type: "created",
            createdBy: master.targetUser,
          });

          return inserted;
        });

        if (!created) {
          result.skipped++;
          continue;
        }

        await cloneMasterRewardTemplateToInstance(db, {
          taskMasterId: master.id,
          taskInstanceId: created.id,
          createdBy: master.targetUser,
        });

        result.created++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed++;
      result.errors.push({ taskMasterId: master.id, message });
      logger.error(
        { err: error, taskMasterId: master.id, date: dateKey },
        "Failed to materialize task instances for task master",
      );
    }
  }

  return result;
}
