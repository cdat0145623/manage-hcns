import {eq} from "drizzle-orm";
import {
  taskInstances,
  statusTypeEnum,
  cardActivities,
} from "@kan/db/schema";
import type { dbClient } from "@kan/db/client";
import pkg from 'rrule';
const { RRule } = pkg;
import { generateUID } from "@kan/shared/utils";

export type TaskStatus = typeof statusTypeEnum.enumValues[number];

export const create = async (
  db: dbClient,
  taskInstanceInput: {
      userId: string,
      taskMasterId: string,
      targetDate: Date,
      actualDate: Date,
      status: TaskStatus,
  }
) => {
  return db.transaction(async (tx) => {
    const [taskInstance] = await tx
    .insert(taskInstances)
    .values({
        userId: taskInstanceInput.userId,
        taskMasterId: taskInstanceInput.taskMasterId,
        targetDate: taskInstanceInput.targetDate,
        actualDate: taskInstanceInput.actualDate,
        status: taskInstanceInput.status,
    })
    .returning({
        id: taskInstances.id,
        userId: taskInstances.userId,
        taskMasterId: taskInstances.taskMasterId,
        targetDate: taskInstances.targetDate,
        actualDate: taskInstances.actualDate,
        status: taskInstances.status,
    });

    if (!taskInstance) {
        throw new Error("Failed to create task instance");
    }

    await tx.insert(cardActivities).values({
      publicId: generateUID(),
      taskInstanceId: taskInstance.id,
      type: "created",
      createdBy: taskInstance.userId,
    });

    return taskInstance;
  });
}

export const generateVirtualTaskInstances = async (params: {
  userId: string;
  taskMasterId: string;
  rruleString: string;
  startDate: Date;
  from: Date;
  to: Date;
}) => {
  const rule = RRule.fromString(params.rruleString);

  rule.options.dtstart = params.startDate;

  const dates = rule.between(params.from, params.to, true);

  if (dates.length > 100) {
    throw new Error("Too many instances generated");
  }

  const hour = params.startDate.getUTCHours();
  const minute = params.startDate.getUTCMinutes();

  return dates.map((date) => {
    const target = new Date(date);
    target.setUTCHours(hour, minute, 0, 0);

    return {
      id: `virtual-${params.taskMasterId}-${date.getTime()}`,
      userId: params.userId,
      taskMasterId: params.taskMasterId,
      targetDate: target,
      actualDate: null,
      status: "pending" as const,
    }
  });
};

export const update = async (
  db: dbClient,
  taskInstanceInput: {
      id: string,
      userId: string,
      taskMasterId: string,
      targetDate: Date,
      actualDate: Date,
      status: TaskStatus,
  }
) => {
  const oldTaskInstance = await db.query.taskInstances.findFirst({
    where: (t, { eq }) => eq(t.id, taskInstanceInput.id),
  });

  const [taskInstance] = await db
  .update(taskInstances)
  .set({
      userId: taskInstanceInput.userId,
      taskMasterId: taskInstanceInput.taskMasterId,
      targetDate: taskInstanceInput.targetDate,
      actualDate: taskInstanceInput.actualDate,
      status: taskInstanceInput.status,
  })
  .where(eq(taskInstances.id, taskInstanceInput.id))
  .returning({
      id: taskInstances.id,
      userId: taskInstances.userId,
      taskMasterId: taskInstances.taskMasterId,
      targetDate: taskInstances.targetDate,
      actualDate: taskInstances.actualDate,
      status: taskInstances.status,
  });

  if (!taskInstance) {
      throw new Error("Failed to update task instance");
  }

  await db.insert(cardActivities).values({
    publicId: generateUID(),
    taskInstanceId: taskInstance.id,
    type: "status_changed",
    oldValue: oldTaskInstance?.status,
    newValue: taskInstance.status,
    createdBy: taskInstance.userId,
  });

  return taskInstance;
}

export const deleteSingle = async (
  db: dbClient,
  taskInstanceInput: {
      id: string,
      userId: string,
  }
) => {
  const [taskInstance] = await db
  .update(taskInstances)
  .set({
      isDeleted: true,
      deleteAt: new Date(),
      deleteBy: taskInstanceInput.userId,
  })
  .where(eq(taskInstances.id, taskInstanceInput.id))
  .returning({
      id: taskInstances.id,
  });

  if (!taskInstance) {
      throw new Error("Failed to delete task instance");
  }

  await db.insert(cardActivities).values({
    publicId: generateUID(),
    taskInstanceId: taskInstance.id,
    type: "archived",
    createdBy: taskInstanceInput.userId,
    createdAt: new Date()
  });

  return taskInstance;
}

export const deleteAll = async (
  db: dbClient,
  taskInstanceInput: {
      taskMasterId: string,
      userId: string,
  }
) => {
  const taskInstance = await db
  .update(taskInstances)
  .set({
      isDeleted: true,
      deleteAt: new Date(),
      deleteBy: taskInstanceInput.userId,
  })
  .where(eq(taskInstances.taskMasterId, taskInstanceInput.taskMasterId));

  if (!taskInstance) {
      throw new Error("Failed to delete task instance");
  }

  return taskInstance;
}