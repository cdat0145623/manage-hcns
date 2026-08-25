import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  cardActivities,
  taskInstanceExtensions,
  taskInstances,
} from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

export interface MarkOverdueTaskInstancesOptions {
  now: Date;
  dryRun?: boolean;
  userId?: string;
  taskInstanceId?: string;
}

export interface MarkOverdueTaskInstancesResult {
  matched: number;
  updated: number;
}

export interface BackfillTaskInstanceActualDatesOptions {
  dryRun?: boolean;
  userId?: string;
  taskInstanceId?: string;
  from?: Date;
  to?: Date;
}

export interface BackfillTaskInstanceActualDatesResult {
  matched: number;
  updated: number;
  skippedNoActivity: number;
}

export interface ExtendMissedTaskInstanceOptions {
  taskInstanceId: string;
  newEndDate: Date;
  reason: string;
  actorUserId: string;
  now: Date;
}

export async function extendMissedTaskInstance(
  db: dbClient,
  options: ExtendMissedTaskInstanceOptions,
) {
  return db.transaction(async (tx) => {
    const currentInstance = await tx.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, options.taskInstanceId),
    });

    if (!currentInstance) return null;

    const [updatedInstance] = await tx
      .update(taskInstances)
      .set({
        status: "pending",
        endDate: options.newEndDate,
        actualDate: null,
        updatedAt: options.now,
      })
      .where(
        and(
          eq(taskInstances.id, options.taskInstanceId),
          eq(taskInstances.status, "missed"),
          eq(taskInstances.isDeleted, false),
        ),
      )
      .returning({
        id: taskInstances.id,
        actualDate: taskInstances.actualDate,
        endDate: taskInstances.endDate,
        status: taskInstances.status,
      });

    if (!updatedInstance) return null;

    if (!currentInstance.endDate) {
      throw new Error("Cannot extend a task instance without a deadline");
    }

    const [extension] = await tx
      .insert(taskInstanceExtensions)
      .values({
        publicId: generateUID(),
        taskInstanceId: updatedInstance.id,
        previousEndDate: currentInstance.endDate,
        newEndDate: options.newEndDate,
        reason: options.reason,
        extendedBy: options.actorUserId,
        createdAt: options.now,
      })
      .returning();

    if (!extension) {
      throw new Error("Failed to create task instance extension history");
    }

    await tx.insert(cardActivities).values([
      {
        publicId: generateUID(),
        taskInstanceId: updatedInstance.id,
        taskInstanceExtensionId: extension.id,
        type: "deadline_extended",
        fromDueDate: currentInstance.endDate,
        toDueDate: options.newEndDate,
        createdBy: options.actorUserId,
        createdAt: options.now,
      },
      {
        publicId: generateUID(),
        taskInstanceId: updatedInstance.id,
        type: "status_changed",
        oldValue: "missed",
        newValue: "pending",
        createdBy: options.actorUserId,
        createdAt: options.now,
      },
    ]);

    return { instance: updatedInstance, extension };
  });
}

export async function markOverdueTaskInstancesMissed(
  db: dbClient,
  options: MarkOverdueTaskInstancesOptions,
): Promise<MarkOverdueTaskInstancesResult> {
  const overdueConditions = and(
    eq(taskInstances.status, "pending"),
    eq(taskInstances.isDeleted, false),
    isNotNull(taskInstances.endDate),
    lt(taskInstances.endDate, options.now),
    ...(options.userId ? [eq(taskInstances.userId, options.userId)] : []),
    ...(options.taskInstanceId
      ? [eq(taskInstances.id, options.taskInstanceId)]
      : []),
  );

  return db.transaction(async (tx) => {
    const matchedInstances = await tx
      .select({ id: taskInstances.id })
      .from(taskInstances)
      .where(overdueConditions);

    if (options.dryRun || matchedInstances.length === 0) {
      return { matched: matchedInstances.length, updated: 0 };
    }

    const updatedInstances = await tx
      .update(taskInstances)
      .set({ status: "missed", updatedAt: options.now })
      .where(overdueConditions)
      .returning({ id: taskInstances.id });

    if (updatedInstances.length > 0) {
      await tx.insert(cardActivities).values(
        updatedInstances.map((instance) => ({
          publicId: generateUID(),
          taskInstanceId: instance.id,
          type: "status_changed" as const,
          oldValue: "pending",
          newValue: "missed",
          createdBy: null,
          createdAt: options.now,
          metadata: { source: "scheduler" },
        })),
      );
    }

    return {
      matched: updatedInstances.length,
      updated: updatedInstances.length,
    };
  });
}

export async function backfillTaskInstanceActualDates(
  db: dbClient,
  options: BackfillTaskInstanceActualDatesOptions = {},
): Promise<BackfillTaskInstanceActualDatesResult> {
  const candidateConditions = and(
    eq(taskInstances.status, "done"),
    eq(taskInstances.isDeleted, false),
    or(
      isNull(taskInstances.actualDate),
      eq(taskInstances.actualDate, taskInstances.targetDate),
    ),
    ...(options.userId ? [eq(taskInstances.userId, options.userId)] : []),
    ...(options.taskInstanceId
      ? [eq(taskInstances.id, options.taskInstanceId)]
      : []),
    ...(options.from ? [gte(taskInstances.targetDate, options.from)] : []),
    ...(options.to ? [lt(taskInstances.targetDate, options.to)] : []),
  );

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: taskInstances.id, targetDate: taskInstances.targetDate })
      .from(taskInstances)
      .where(candidateConditions);

    if (candidates.length === 0) {
      return { matched: 0, updated: 0, skippedNoActivity: 0 };
    }

    const doneActivities = await tx
      .select({
        taskInstanceId: cardActivities.taskInstanceId,
        createdAt: cardActivities.createdAt,
      })
      .from(cardActivities)
      .where(
        and(
          inArray(
            cardActivities.taskInstanceId,
            candidates.map((candidate) => candidate.id),
          ),
          eq(cardActivities.type, "status_changed"),
          eq(cardActivities.newValue, "done"),
        ),
      )
      .orderBy(desc(cardActivities.createdAt));

    const latestDoneAtByInstance = new Map<string, Date>();
    for (const activity of doneActivities) {
      if (
        activity.taskInstanceId &&
        !latestDoneAtByInstance.has(activity.taskInstanceId)
      ) {
        latestDoneAtByInstance.set(activity.taskInstanceId, activity.createdAt);
      }
    }

    const recoverableCandidates = candidates.filter((candidate) =>
      latestDoneAtByInstance.has(candidate.id),
    );
    const skippedNoActivity = candidates.length - recoverableCandidates.length;

    if (!options.dryRun) {
      for (const candidate of recoverableCandidates) {
        await tx
          .update(taskInstances)
          .set({ actualDate: latestDoneAtByInstance.get(candidate.id) })
          .where(eq(taskInstances.id, candidate.id));
      }
    }

    return {
      matched: candidates.length,
      updated: options.dryRun ? 0 : recoverableCandidates.length,
      skippedNoActivity,
    };
  });
}
