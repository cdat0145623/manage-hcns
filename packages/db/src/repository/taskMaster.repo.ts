import { and, eq, isNull } from "drizzle-orm";

import type { dbClient } from "../client";
import { taskMasters } from "../schema/task-masters";
import { generateUID } from "@kan/shared/utils";

import type { RecurrenceRule } from "../schema/task-masters";

export const create = async (
  db: dbClient,
  input: {
    workspaceId: number;
    title: string;
    description?: string;
    recurrenceRule: RecurrenceRule;
    defaultStartTime?: string;
    defaultEndTime?: string;
    createdBy: string;
  },
) => {
  const [result] = await db
    .insert(taskMasters)
    .values({
      publicId: generateUID(),
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description,
      recurrenceRule: input.recurrenceRule,
      defaultStartTime: input.defaultStartTime,
      defaultEndTime: input.defaultEndTime,
      createdBy: input.createdBy,
    })
    .returning({
      id: taskMasters.id,
      publicId: taskMasters.publicId,
      title: taskMasters.title,
    });

  return result;
};

export const getByPublicId = (db: dbClient, publicId: string) => {
  return db.query.taskMasters.findFirst({
    where: and(
      eq(taskMasters.publicId, publicId),
      isNull(taskMasters.deletedAt),
    ),
    with: {
      workspace: {
        columns: { id: true, publicId: true, name: true },
      },
    },
  });
};

export const getAllByWorkspaceId = (db: dbClient, workspaceId: number) => {
  return db.query.taskMasters.findMany({
    where: and(
      eq(taskMasters.workspaceId, workspaceId),
      isNull(taskMasters.deletedAt),
    ),
    with: {
      instances: {
        columns: {
          id: true,
          publicId: true,
          targetDate: true,
          status: true,
          actualStartAt: true,
          actualEndAt: true,
          cardId: true,
        },
      },
    },
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
};

export const getActiveByWorkspaceId = (db: dbClient, workspaceId: number) => {
  return db.query.taskMasters.findMany({
    where: and(
      eq(taskMasters.workspaceId, workspaceId),
      eq(taskMasters.isActive, true),
      isNull(taskMasters.deletedAt),
    ),
    orderBy: (t, { asc }) => [asc(t.createdAt)],
  });
};

export const update = async (
  db: dbClient,
  id: number,
  input: {
    title?: string;
    description?: string;
    recurrenceRule?: RecurrenceRule;
    defaultStartTime?: string;
    defaultEndTime?: string;
    isActive?: boolean;
  },
) => {
  const [result] = await db
    .update(taskMasters)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(taskMasters.id, id), isNull(taskMasters.deletedAt)))
    .returning({ id: taskMasters.id, publicId: taskMasters.publicId });

  return result;
};

export const softDelete = async (db: dbClient, id: number) => {
  const [result] = await db
    .update(taskMasters)
    .set({ deletedAt: new Date() })
    .where(eq(taskMasters.id, id))
    .returning({ id: taskMasters.id });

  return result;
};
