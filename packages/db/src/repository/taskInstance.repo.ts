/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { eq } from "drizzle-orm";
import * as rruleModule from "rrule";

import type { dbClient } from "@kan/db/client";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { cardActivities, statusTypeEnum, taskInstances } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import { buildScheduleOnAnchorDay } from "./task-master-schedule";

type RRuleExports = Pick<typeof rruleModule, "RRule">;
const rruleCandidate = rruleModule as RRuleExports & {
  default?: RRuleExports;
};
const rruleExports = rruleCandidate.RRule
  ? rruleCandidate
  : rruleCandidate.default;

if (!rruleExports?.RRule) {
  throw new Error("rrule did not expose the RRule constructor");
}

const { RRule } = rruleExports;

export type TaskStatus = (typeof statusTypeEnum.enumValues)[number];

export const create = async (
  db: dbClient,
  taskInstanceInput: {
    userId: string;
    taskMasterId: string;
    name: string;
    description: string;
    targetDate: Date;
    actualDate: Date | null;
    endDate: Date;
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
        endDate: taskInstanceInput.endDate,
        status: taskInstanceInput.status,
      })
      .returning({
        id: taskInstances.id,
        userId: taskInstances.userId,
        taskMasterId: taskInstances.taskMasterId,
        targetDate: taskInstances.targetDate,
        actualDate: taskInstances.actualDate,
        endDate: taskInstances.endDate,
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
  masterEndDate: Date;
  from: Date;
  to: Date;
}) => {
  const normalizedRrule = params.rruleString.replace(/\\n/g, "\n");

  // Phân tách TZID từ chuỗi RRULE (ví dụ: Asia/Ho_Chi_Minh)
  const tzidMatch = /TZID=([^;:]+)/.exec(normalizedRrule);
  const tzid = tzidMatch?.[1] ?? "Asia/Ho_Chi_Minh";

  // Hàm lấy offset (ms) của múi giờ tại một thời điểm cụ thể
  const getOffset = (date: Date, timeZone: string) => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });
      const parts = formatter.formatToParts(date);
      const map: any = {};
      parts.forEach((p) => (map[p.type] = p.value));
      const localDate = new Date(
        Date.UTC(
          Number(map.year),
          Number(map.month) - 1,
          Number(map.day),
          Number(map.hour) % 24,
          Number(map.minute),
          Number(map.second),
        ),
      );
      return localDate.getTime() - date.getTime();
    } catch {
      return 0;
    }
  };

  const offset = getOffset(params.startDate, tzid);

  // Chuyển đổi sang "Floating Time" (giờ Local trông như giờ UTC để RRule đánh giá đúng thứ trong tuần)
  const floatingStart = new Date(params.startDate.getTime() + offset);
  const floatingFrom = new Date(params.from.getTime() + offset);
  const floatingTo = new Date(params.to.getTime() + offset);

  const rule = RRule.fromString(normalizedRrule);

  // The evaluation rule uses floating UTC values whose fields represent
  // calendar wall-clock values in `tzid`. Keeping RRule's original tzid here
  // makes it apply the timezone conversion a second time on UTC runtimes.
  const { tzid: _tzid, ...floatingRuleOptions } = rule.options;

  // Ghi đè dtstart và các thành phần thời gian để RRule evaluation chuẩn xác
  const evaluationRule = new RRule({
    ...floatingRuleOptions,
    dtstart: floatingStart,
    // Đảm bảo RRule sử dụng đúng giờ/phút của floatingStart
    byhour: [floatingStart.getUTCHours()],
    byminute: [floatingStart.getUTCMinutes()],
    bysecond: [floatingStart.getUTCSeconds()],
  });

  const dates = evaluationRule.between(floatingFrom, floatingTo, true);

  if (dates.length > 100) {
    throw new Error("Too many instances generated");
  }

  return dates.map((date) => {
    // Chuyển đổi ngược lại từ Floating Time về UTC thật sự
    const target = new Date(date.getTime() - offset);

    const { endDate: instanceEndDate } = buildScheduleOnAnchorDay(
      target,
      params.startDate,
      params.masterEndDate,
    );

    return {
      id: `virtual_${params.taskMasterId}_${target.getTime()}`,
      userId: params.userId,
      taskMasterId: params.taskMasterId,
      targetDate: target,
      actualDate: null,
      endDate: instanceEndDate,
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
    actualDate?: Date | null;
    endDate?: Date;
    status: TaskStatus;
    actorUserId: string;
  },
) => {
  return db.transaction(async (tx) => {
    const oldTaskInstance = await tx.query.taskInstances.findFirst({
      where: (t, { eq }) => eq(t.id, taskInstanceInput.id),
    });

    const [taskInstance] = await tx
      .update(taskInstances)
      .set({
        userId: taskInstanceInput.userId,
        taskMasterId: taskInstanceInput.taskMasterId,
        name: taskInstanceInput.name,
        description: taskInstanceInput.description,
        status: taskInstanceInput.status,
        updatedAt: new Date(),
        ...(taskInstanceInput.targetDate !== undefined
          ? { targetDate: taskInstanceInput.targetDate }
          : {}),
        ...(taskInstanceInput.actualDate !== undefined
          ? { actualDate: taskInstanceInput.actualDate }
          : {}),
        ...(taskInstanceInput.endDate !== undefined
          ? { endDate: taskInstanceInput.endDate }
          : {}),
      })
      .where(eq(taskInstances.id, taskInstanceInput.id))
      .returning({
        id: taskInstances.id,
        userId: taskInstances.userId,
        taskMasterId: taskInstances.taskMasterId,
        targetDate: taskInstances.targetDate,
        actualDate: taskInstances.actualDate,
        endDate: taskInstances.endDate,
        status: taskInstances.status,
      });

    if (!taskInstance) {
      throw new Error("Failed to update task instance");
    }

    if (oldTaskInstance?.status !== taskInstance.status) {
      await tx.insert(cardActivities).values({
        publicId: generateUID(),
        taskInstanceId: taskInstance.id,
        type: "status_changed",
        oldValue: oldTaskInstance?.status,
        newValue: taskInstance.status,
        createdBy: taskInstanceInput.actorUserId,
      });
    }

    return taskInstance;
  });
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
  const isVirtual = taskInstanceInput.id.startsWith("virtual_");
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
