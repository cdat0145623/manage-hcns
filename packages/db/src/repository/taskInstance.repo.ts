/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { eq } from "drizzle-orm";
import pkg from "rrule";

import type { dbClient } from "@kan/db/client";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { cardActivities, statusTypeEnum, taskInstances } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

const { RRule } = pkg;

export type TaskStatus = (typeof statusTypeEnum.enumValues)[number];

export const create = async (
  db: dbClient,
  taskInstanceInput: {
    userId: string;
    taskMasterId: string;
    name: string;
    description: string;
    targetDate: Date;
    actualDate: Date;
    status: TaskStatus;
  },
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
};

export const generateVirtualTaskInstances = async (params: {
  userId: string;
  taskMasterId: string;
  rruleString: string;
  startDate: Date;
  from: Date;
  to: Date;
}) => {
  const normalizedRrule = params.rruleString.replace(/\\n/g, "\n");
  const rule = RRule.fromString(normalizedRrule);

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
      id: `virtual_${params.taskMasterId}_${date.getTime()}`,
      userId: params.userId,
      taskMasterId: params.taskMasterId,
      targetDate: target,
      actualDate: null,
      status: "pending" as const,
    };
  });
};

export const update = async (
  db: dbClient,
  taskInstanceInput: {
    id: string;
    userId: string;
    taskMasterId: string;
    name?: string;
    description?: string;
    targetDate?: Date;
    actualDate?: Date;
    status: TaskStatus;
  },
) => {
  const oldTaskInstance = await db.query.taskInstances.findFirst({
    where: (t, { eq }) => eq(t.id, taskInstanceInput.id),
  });

  const [taskInstance] = await db
    .update(taskInstances)
    .set({
      userId: taskInstanceInput.userId,
      taskMasterId: taskInstanceInput.taskMasterId,
      name: taskInstanceInput.name,
      description: taskInstanceInput.description,
      targetDate: taskInstanceInput.targetDate,
      actualDate: taskInstanceInput.actualDate,
      status: taskInstanceInput.status,
      updatedAt: new Date(),
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
};

export const deleteSingle = async (
  db: dbClient,
  taskInstanceInput: {
    id: string;
    userId: string;
    taskMasterId?: string;
  },
) => {
  let finalId = taskInstanceInput.id;
  // KIỂM TRA: Nếu ID bắt đầu bằng "virtual_", đây là công việc lặp lại chưa có trong DB
  let isVirtual = taskInstanceInput.id.startsWith("virtual_");
  const [taskInstance] = await db
    .update(taskInstances)
    .set({
      isDeleted: true,
      deleteAt: new Date(),
      deleteBy: taskInstanceInput.userId,
      updatedAt: new Date(),
    })
    .where(eq(taskInstances.id, taskInstanceInput.id))
    .returning({
      id: taskInstances.id,
    });

  if (isVirtual) {
    // 1. XỬ LÝ CÔNG VIỆC ẢO (VIRTUAL):
    // Phân tách ID ảo để lấy taskMasterId và timestamp của ngày đó (dùng "_" để tránh nhầm với "-" của UUID)
    const parts = taskInstanceInput.id.split("_");
    const masterId = parts[1];
    const timestamp = parts[2];

    if (!masterId || !timestamp) {
      throw new Error("Invalid virtual task ID format");
    }

    const targetDate = new Date(parseInt(timestamp));

    // 2. TẠO BẢN GHI "CHẶN" (BLOCKER) HOẶC CẬP NHẬT NẾU ĐÃ CÓ:
    // Sử dụng UPSERT (onConflictDoUpdate) để nếu bản ghi đã tồn tại (ví dụ đã từng bấm Done)
    // thì ta chỉ đơn giản cập nhật nó thành isDeleted = true thay vì báo lỗi.
    const [newInstance] = await db
      .insert(taskInstances)
      .values({
        userId: taskInstanceInput.userId,
        taskMasterId: masterId,
        targetDate: targetDate,
        isDeleted: true,
        deleteAt: new Date(),
        deleteBy: taskInstanceInput.userId,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: [
          taskInstances.userId,
          taskInstances.taskMasterId,
          taskInstances.targetDate,
        ],
        set: {
          isDeleted: true,
          deleteAt: new Date(),
          deleteBy: taskInstanceInput.userId,
        },
      })
      .returning({
        id: taskInstances.id,
      });

    if (!newInstance) {
      throw new Error("Failed to eliminate virtual task instance");
    }

    finalId = newInstance.id; // Lấy ID thật vừa tạo/cập nhật để ghi log activity
  } else {
    // 3. XỬ LÝ CÔNG VIỆC THẬT (DATABASE):
    // Nếu là ID UUID thật, chỉ cần cập nhật cờ isDeleted = true
    const [updatedInstance] = await db
      .update(taskInstances)
      .set({
        isDeleted: true,
        deleteAt: new Date(),
        deleteBy: taskInstanceInput.userId,
      })
      .where(eq(taskInstances.id, finalId))
      .returning({
        id: taskInstances.id,
      });

    if (!updatedInstance) {
      throw new Error("Failed to delete task instance");
    }

    finalId = updatedInstance.id;
  }

  // 4. GHI LOG HOẠT ĐỘNG: Tạo bản ghi trong cardActivities để theo dõi việc xóa
  await db.insert(cardActivities).values({
    publicId: generateUID(),
    taskInstanceId: finalId,
    type: "archived",
    createdBy: taskInstanceInput.userId,
    createdAt: new Date(),
  });

  return { id: finalId };
};

export const updateStatusById = async (
  db: dbClient,
  taskInstanceId: string,
  status: TaskStatus,
) => {
  const [result] = await db
    .update(taskInstances)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(taskInstances.id, taskInstanceId))
    .returning({
      id: taskInstances.id,
      status: taskInstances.status,
    });

  return result;
};

export const deleteAll = async (
  db: dbClient,
  taskInstanceInput: {
    taskMasterId: string;
    userId: string;
  },
) => {
  const taskInstance = await db
    .update(taskInstances)
    .set({
      isDeleted: true,
      deleteAt: new Date(),
      deleteBy: taskInstanceInput.userId,
      updatedAt: new Date(),
    })
    .where(eq(taskInstances.taskMasterId, taskInstanceInput.taskMasterId));

  if (!taskInstance) {
    throw new Error("Failed to delete task instance");
  }

  return taskInstance;
};
