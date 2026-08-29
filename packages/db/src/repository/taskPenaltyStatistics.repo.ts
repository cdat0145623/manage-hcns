import { and, eq, gte, isNotNull, lt } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  taskInstances,
  taskMasters,
  taskPenaltyAssessments,
} from "@kan/db/schema";

export type DailyTaskPenaltyPriority = "high" | "medium" | "low";
export type DailyTaskPenaltySource = "common" | "custom";

export interface PenaltyBucket {
  count: number;
  amountVnd: number;
}

export interface DailyTaskPenaltyEntry {
  taskMasterPublicId: string | null;
  taskName: string | null;
  targetDate: Date;
  createdAt: Date;
  priority: DailyTaskPenaltyPriority;
  source: DailyTaskPenaltySource;
  amountVnd: number;
}

interface PenaltyRow {
  taskMasterPublicId: string | null;
  taskName: string | null;
  taskMasterName?: string | null;
  targetDate: Date | null;
  createdAt: Date;
  priority: string | null;
  source: string;
  amountVnd: number;
}

const priorities: DailyTaskPenaltyPriority[] = ["high", "medium", "low"];

const createBucket = (): PenaltyBucket => ({ count: 0, amountVnd: 0 });

export function groupDailyTaskPenaltyRows(rows: PenaltyRow[]): {
  entries: DailyTaskPenaltyEntry[];
  total: PenaltyBucket;
} {
  const total = createBucket();
  const entries: DailyTaskPenaltyEntry[] = [];

  for (const row of rows) {
    if (!row.targetDate) continue;
    if (!priorities.includes(row.priority as DailyTaskPenaltyPriority))
      continue;
    const priority = row.priority as DailyTaskPenaltyPriority;
    const source: DailyTaskPenaltySource =
      row.source === "master_override" ? "custom" : "common";
    total.count += 1;
    total.amountVnd += row.amountVnd;
    entries.push({
      taskMasterPublicId: row.taskMasterPublicId,
      taskName: row.taskName ?? row.taskMasterName ?? null,
      targetDate: row.targetDate,
      createdAt: row.createdAt,
      priority,
      source,
      amountVnd: row.amountVnd,
    });
  }

  entries.sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
  return { entries, total };
}

export async function getDailyTaskPenaltyStatistics(
  db: dbClient,
  input: { from: Date; to: Date; targetUserId?: string },
) {
  const rows = await db
    .select({
      taskMasterPublicId: taskMasters.publicId,
      taskName: taskInstances.name,
      taskMasterName: taskMasters.name,
      targetDate: taskInstances.targetDate,
      createdAt: taskInstances.createdAt,
      priority: taskInstances.penaltyPriority,
      source: taskPenaltyAssessments.source,
      amountVnd: taskPenaltyAssessments.amountVnd,
    })
    .from(taskPenaltyAssessments)
    .innerJoin(
      taskInstances,
      eq(taskPenaltyAssessments.taskInstanceId, taskInstances.id),
    )
    .innerJoin(taskMasters, eq(taskInstances.taskMasterId, taskMasters.id))
    .where(
      and(
        eq(taskPenaltyAssessments.status, "active"),
        eq(taskInstances.isDeleted, false),
        isNotNull(taskInstances.targetDate),
        gte(taskInstances.targetDate, input.from),
        lt(taskInstances.targetDate, input.to),
        ...(input.targetUserId
          ? [eq(taskInstances.userId, input.targetUserId)]
          : []),
      ),
    );

  return groupDailyTaskPenaltyRows(rows);
}
