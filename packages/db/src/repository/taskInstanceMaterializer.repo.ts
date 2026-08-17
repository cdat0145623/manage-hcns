import { and, eq, gte, lt } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
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

export async function materializeTaskInstances(
  db: dbClient,
  options: MaterializeTaskInstancesOptions,
): Promise<MaterializeTaskInstancesResult> {
  const { dayStart, dateKey } = normalizeDateKey(options.date);
  const nextDayStart = getNextDayStart(dayStart);
  const dayEnd = new Date(nextDayStart.getTime() - 1);

  const masters = await db.query.taskMasters.findMany({
    where: (taskMaster) =>
      and(
        eq(taskMaster.isDeleted, false),
        lt(taskMaster.startDate, nextDayStart),
        gte(taskMaster.endDate, dayStart),
        ...(options.taskMasterId
          ? [eq(taskMaster.id, options.taskMasterId)]
          : []),
        ...(options.userId ? [eq(taskMaster.targetUser, options.userId)] : []),
      ),
    with: { frequence: true },
  });

  const result: MaterializeTaskInstancesResult = {
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

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
              endDate: occurrence.endDate,
              status: "pending" as TaskStatus,
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
