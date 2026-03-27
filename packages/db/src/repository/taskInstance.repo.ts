import { and, eq, gte, lte } from "drizzle-orm";

import { generateUID } from "@kan/shared/utils";

import type { dbClient } from "../client";
import type { TaskInstanceStatus } from "../schema/task-masters";
import { taskInstances } from "../schema/task-masters";

export const upsert = async (
  db: dbClient,
  input: {
    masterId: number;
    targetDate: Date;
    createdBy: string;
    status?: TaskInstanceStatus;
    cardId?: number;
  },
) => {
  const [result] = await db
    .insert(taskInstances)
    .values({
      publicId: generateUID(),
      masterId: input.masterId,
      targetDate: input.targetDate,
      status: input.status ?? "pending",
      cardId: input.cardId,
      createdBy: input.createdBy,
    })
    .onConflictDoNothing()
    .returning({
      id: taskInstances.id,
      publicId: taskInstances.publicId,
      targetDate: taskInstances.targetDate,
      status: taskInstances.status,
    });

  return result;
};

export const getByMasterAndDate = (
  db: dbClient,
  masterId: number,
  targetDate: Date,
) => {
  return db.query.taskInstances.findFirst({
    where: and(
      eq(taskInstances.masterId, masterId),
      eq(taskInstances.targetDate, targetDate),
    ),
  });
};

export const getByMasterId = (
  db: dbClient,
  masterId: number,
  dateRange?: { from: Date; to: Date },
) => {
  const conditions = [eq(taskInstances.masterId, masterId)];

  if (dateRange) {
    conditions.push(gte(taskInstances.targetDate, dateRange.from));
    conditions.push(lte(taskInstances.targetDate, dateRange.to));
  }

  return db.query.taskInstances.findMany({
    where: and(...conditions),
    with: {
      card: {
        columns: {
          id: true,
          publicId: true,
          title: true,
        },
      },
    },
    orderBy: (t, { asc }) => [asc(t.targetDate)],
  });
};

export const getByWorkspaceInRange = (
  db: dbClient,
  masterIds: number[],
  from: Date,
  to: Date,
) => {
  if (masterIds.length === 0) return Promise.resolve([]);

  return db.query.taskInstances.findMany({
    where: and(
      gte(taskInstances.targetDate, from),
      lte(taskInstances.targetDate, to),
    ),
    orderBy: (t, { asc }) => [asc(t.targetDate)],
  });
};

export const updateStatus = async (
  db: dbClient,
  instancePublicId: string,
  status: TaskInstanceStatus,
  extra?: { actualStartAt?: Date; actualEndAt?: Date; note?: string },
) => {
  const [result] = await db
    .update(taskInstances)
    .set({
      status,
      updatedAt: new Date(),
      ...(extra?.actualStartAt && { actualStartAt: extra.actualStartAt }),
      ...(extra?.actualEndAt && { actualEndAt: extra.actualEndAt }),
      ...(extra?.note !== undefined && { note: extra.note }),
    })
    .where(eq(taskInstances.publicId, instancePublicId))
    .returning({
      id: taskInstances.id,
      publicId: taskInstances.publicId,
      status: taskInstances.status,
    });

  return result;
};
