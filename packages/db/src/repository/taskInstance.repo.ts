/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { and, eq } from "drizzle-orm";
import * as rruleModule from "rrule";

import type { dbClient } from "@kan/db/client";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  cardActivities,
  statusTypeEnum,
  taskInstanceExtensions,
  taskInstances,
  taskPenaltyAssessments,
} from "@kan/db/schema";
import { applyMasterWallTimeToAnchorDay, generateUID } from "@kan/shared/utils";

import type { PenaltyPolicyActivityMetadata } from "./taskPenaltyPolicy.repo";
import { loadPenaltySnapshotsForMasters } from "./taskPenaltyPolicy.repo";

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

async function assessTaskInstancePenalty(
  db: dbClient,
  instance: {
    id: string;
    penaltyAmountVnd: number | null;
    penaltySource:
      | "system_default"
      | "global_policy"
      | "master_override"
      | null;
    penaltyPolicyPublicId: string | null;
  },
  options: { actorUserId: string | null; assessedAt: Date },
) {
  if (instance.penaltyAmountVnd === null || instance.penaltySource === null) {
    return null;
  }

  const [assessment] = await db
    .insert(taskPenaltyAssessments)
    .values({
      publicId: generateUID(),
      taskInstanceId: instance.id,
      amountVnd: instance.penaltyAmountVnd,
      source: instance.penaltySource,
      policyPublicId: instance.penaltyPolicyPublicId,
      assessedAt: options.assessedAt,
    })
    .onConflictDoNothing({ target: taskPenaltyAssessments.taskInstanceId })
    .returning({ publicId: taskPenaltyAssessments.publicId });

  if (assessment) {
    await db.insert(cardActivities).values({
      publicId: generateUID(),
      taskInstanceId: instance.id,
      type: "penalty_assessed",
      createdBy: options.actorUserId,
      createdAt: options.assessedAt,
      metadata: {
        amountVnd: instance.penaltyAmountVnd,
        currency: "VND",
        source: instance.penaltySource,
        policyPublicId: instance.penaltyPolicyPublicId,
      },
    });
  }

  return assessment ?? null;
}

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
  const master = await db.query.taskMasters.findFirst({
    where: (table, { eq }) => eq(table.id, taskInstanceInput.taskMasterId),
    columns: {
      id: true,
      priority: true,
      penaltyOverrideAmountVnd: true,
    },
  });
  if (!master) throw new Error("Task master not found");
  const penaltySnapshots = await loadPenaltySnapshotsForMasters(
    db,
    [
      {
        id: master.id,
        priority: master.priority,
        overrideAmountVnd: master.penaltyOverrideAmountVnd,
      },
    ],
    taskInstanceInput.targetDate,
  );
  const penaltySnapshot = penaltySnapshots.get(master.id) ?? null;

  return db.transaction(async (tx) => {
    const [insertedTaskInstance] = await tx
      .insert(taskInstances)
      .values({
        userId: taskInstanceInput.userId,
        taskMasterId: taskInstanceInput.taskMasterId,
        name: taskInstanceInput.name,
        description: taskInstanceInput.description,
        targetDate: taskInstanceInput.targetDate,
        actualDate: taskInstanceInput.actualDate,
        originalEndDate: taskInstanceInput.endDate,
        endDate: taskInstanceInput.endDate,
        status: taskInstanceInput.status,
        penaltyPriority: penaltySnapshot?.priority,
        penaltyAmountVnd: penaltySnapshot?.amountVnd,
        penaltySource: penaltySnapshot?.source,
        penaltyPolicyPublicId: penaltySnapshot?.policyPublicId,
        penaltySnapshottedAt: penaltySnapshot ? new Date() : null,
      })
      .onConflictDoNothing({
        target: [
          taskInstances.userId,
          taskInstances.taskMasterId,
          taskInstances.targetDate,
        ],
      })
      .returning({
        id: taskInstances.id,
        userId: taskInstances.userId,
        taskMasterId: taskInstances.taskMasterId,
        targetDate: taskInstances.targetDate,
        actualDate: taskInstances.actualDate,
        originalEndDate: taskInstances.originalEndDate,
        endDate: taskInstances.endDate,
        status: taskInstances.status,
        penaltyAmountVnd: taskInstances.penaltyAmountVnd,
        penaltySource: taskInstances.penaltySource,
        penaltyPolicyPublicId: taskInstances.penaltyPolicyPublicId,
      });

    const taskInstance =
      insertedTaskInstance ??
      (await tx.query.taskInstances.findFirst({
        where: and(
          eq(taskInstances.userId, taskInstanceInput.userId),
          eq(taskInstances.taskMasterId, taskInstanceInput.taskMasterId),
          eq(taskInstances.targetDate, taskInstanceInput.targetDate),
        ),
        columns: {
          id: true,
          userId: true,
          taskMasterId: true,
          targetDate: true,
          actualDate: true,
          originalEndDate: true,
          endDate: true,
          status: true,
          penaltyAmountVnd: true,
          penaltySource: true,
          penaltyPolicyPublicId: true,
        },
      }));

    if (!taskInstance) {
      throw new Error("Failed to create task instance");
    }

    if (!insertedTaskInstance) {
      return taskInstance;
    }

    await tx.insert(cardActivities).values({
      publicId: generateUID(),
      taskInstanceId: taskInstance.id,
      type: "created",
      createdBy: taskInstance.userId,
    });

    if (penaltySnapshot) {
      const metadata: PenaltyPolicyActivityMetadata = {
        version: 1,
        effectiveFrom: penaltySnapshot.effectiveFrom.toISOString(),
        priority: penaltySnapshot.priority,
        amountVnd: penaltySnapshot.amountVnd,
        source: penaltySnapshot.source,
        globalDefaultAmountVnd: penaltySnapshot.globalDefaultAmountVnd,
        policyPublicId: penaltySnapshot.policyPublicId,
      };
      await tx.insert(cardActivities).values({
        publicId: generateUID(),
        taskInstanceId: taskInstance.id,
        type: "penalty_policy_applied",
        createdBy: null,
        metadata,
      });
    }

    if (taskInstance.status === "missed") {
      await assessTaskInstancePenalty(tx, taskInstance, {
        actorUserId: taskInstance.userId,
        assessedAt: new Date(),
      });
    }

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
  const tzid = tzidMatch?.[1] ?? "UTC";

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

  // Ghi đè dtstart và các thành phần thời gian để RRule evaluation chuẩn xác
  const evaluationRule = new RRule({
    ...rule.options,
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

    const instanceEndDate = applyMasterWallTimeToAnchorDay(
      target,
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
    expectedStatus: TaskStatus;
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
    const currentInstance = await tx.query.taskInstances.findFirst({
      where: (table, { eq }) => eq(table.id, taskInstanceInput.id),
    });
    if (!currentInstance) return null;

    const targetDateChanged =
      taskInstanceInput.targetDate !== undefined &&
      currentInstance.targetDate?.getTime() !==
        taskInstanceInput.targetDate.getTime();
    const endDateChanged =
      taskInstanceInput.endDate !== undefined &&
      currentInstance.endDate?.getTime() !==
        taskInstanceInput.endDate.getTime();

    const extension = await tx.query.taskInstanceExtensions.findFirst({
      columns: { id: true },
      where: eq(taskInstanceExtensions.taskInstanceId, taskInstanceInput.id),
    });
    if ((targetDateChanged || endDateChanged) && extension) return null;

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
          ? {
              endDate: taskInstanceInput.endDate,
              ...(extension
                ? {}
                : { originalEndDate: taskInstanceInput.endDate }),
            }
          : {}),
      })
      .where(
        and(
          eq(taskInstances.id, taskInstanceInput.id),
          eq(taskInstances.status, taskInstanceInput.expectedStatus),
          eq(taskInstances.isDeleted, false),
        ),
      )
      .returning({
        id: taskInstances.id,
        userId: taskInstances.userId,
        taskMasterId: taskInstances.taskMasterId,
        targetDate: taskInstances.targetDate,
        actualDate: taskInstances.actualDate,
        originalEndDate: taskInstances.originalEndDate,
        endDate: taskInstances.endDate,
        status: taskInstances.status,
        penaltyAmountVnd: taskInstances.penaltyAmountVnd,
        penaltySource: taskInstances.penaltySource,
        penaltyPolicyPublicId: taskInstances.penaltyPolicyPublicId,
      });

    if (!taskInstance) return null;

    if (taskInstanceInput.expectedStatus !== taskInstance.status) {
      await tx.insert(cardActivities).values({
        publicId: generateUID(),
        taskInstanceId: taskInstance.id,
        type: "status_changed",
        oldValue: taskInstanceInput.expectedStatus,
        newValue: taskInstance.status,
        createdBy: taskInstanceInput.actorUserId,
      });

      if (taskInstance.status === "missed") {
        await assessTaskInstancePenalty(tx, taskInstance, {
          actorUserId: taskInstanceInput.actorUserId,
          assessedAt: new Date(),
        });
      }
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
