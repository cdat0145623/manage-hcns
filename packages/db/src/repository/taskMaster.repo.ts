import { and, eq, gte } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import {
  cardActivities,
  frequences,
  taskInstances,
  taskMasters,
  users,
} from "@kan/db/schema";
import {
  calendarDateKeyInAppZone,
  generateUID,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

import * as cardActivitesRepo from "./cardActivity.repo";
import * as frequenceRepo from "./frequence.repo";
import { cloneMasterRewardTemplateToInstanceInTransaction } from "./reward.repo";
import {
  buildPendingInstanceReconciliation,
  getArchivedPendingInstanceIdsBlockingSchedules,
  hasSameRecurrenceCadence,
} from "./task-master-schedule";
import * as taskInstanceRepo from "./taskInstance.repo";

export const create = async (
  db: dbClient,
  taskMasterInput: {
    userId: string;
    name: string;
    description: string;
    startDate: Date;
    endDate: Date;
    selectedUserId: string;
    rruleString: string;
  },
) => {
  return await db.transaction(async (tx) => {
    const frequence = await frequenceRepo.create(tx, {
      name: taskMasterInput.rruleString,
      rrule: taskMasterInput.rruleString,
      dtStart: taskMasterInput.startDate,
    });

    // 2. Tạo task master
    const [taskMaster] = await tx
      .insert(taskMasters)
      .values({
        targetUser: taskMasterInput.selectedUserId,
        name: taskMasterInput.name,
        description: taskMasterInput.description,
        startDate: taskMasterInput.startDate,
        endDate: taskMasterInput.endDate,
        createdBy: taskMasterInput.userId,
        freqId: frequence.id,
      })
      .returning({
        id: taskMasters.id,
        name: taskMasters.name,
        description: taskMasters.description,
        startDate: taskMasters.startDate,
        endDate: taskMasters.endDate,
        targetUser: taskMasters.targetUser,
        createdBy: taskMasters.createdBy,
      });

    if (!taskMaster) {
      throw new Error("Failed to create task master");
    }

    await tx.insert(cardActivities).values({
      publicId: generateUID(),
      taskMasterId: taskMaster.id,
      type: "created",
      createdBy: taskMasterInput.userId,
    });

    await tx.insert(cardActivities).values({
      publicId: generateUID(),
      freqId: frequence.id,
      type: "created",
      createdBy: taskMasterInput.userId,
    });

    return taskMaster;
  });
};

export const update = async (
  db: dbClient,
  taskMasterInput: {
    id: string;
    name?: string;
    description?: string;
    startDate?: Date;
    endDate?: Date;
    selectedUserId?: string;
    rruleString?: string;
    userId: string;
    effectiveFrom: string;
  },
) => {
  return await db.transaction(async (tx) => {
    const [existingTaskMaster] = await tx
      .select()
      .from(taskMasters)
      .where(eq(taskMasters.id, taskMasterInput.id))
      .for("update");

    if (!existingTaskMaster) {
      throw new Error("Task master not found");
    }
    const [actor] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, taskMasterInput.userId))
      .for("share");
    if (!actor) {
      throw new Error("TASK_MASTER_FORBIDDEN");
    }
    if (
      actor.role !== "ADMIN" &&
      taskMasterInput.userId !== existingTaskMaster.createdBy &&
      taskMasterInput.userId !== existingTaskMaster.targetUser
    ) {
      throw new Error("TASK_MASTER_FORBIDDEN");
    }

    const oldFreq = await tx.query.frequences.findFirst({
      where: eq(frequences.id, existingTaskMaster.freqId),
    });

    if (!oldFreq) {
      throw new Error("Frequency not found");
    }

    const nextStartDate =
      taskMasterInput.startDate ?? existingTaskMaster.startDate;
    const nextEndDate = taskMasterInput.endDate ?? existingTaskMaster.endDate;
    const nextTargetUser =
      taskMasterInput.selectedUserId ?? existingTaskMaster.targetUser;
    const nextName = taskMasterInput.name ?? existingTaskMaster.name;
    const nextDescription =
      taskMasterInput.description ?? existingTaskMaster.description;
    const nextRruleString = taskMasterInput.rruleString ?? oldFreq.rruleString;

    let frequence;
    if (
      taskMasterInput.rruleString !== undefined ||
      taskMasterInput.startDate !== undefined
    ) {
      frequence = await frequenceRepo.update(tx, {
        id: existingTaskMaster.freqId,
        name: nextRruleString,
        rrule: nextRruleString,
        dtStart: nextStartDate,
      });
    }

    // 2. Tạo task master
    const [taskMaster] = await tx
      .update(taskMasters)
      .set({
        targetUser: nextTargetUser,
        name: nextName,
        description: nextDescription,
        startDate: nextStartDate,
        endDate: nextEndDate,
        freqId: frequence?.id ?? oldFreq.id,
        updatedAt: new Date(),
      })
      .where(eq(taskMasters.id, taskMasterInput.id))
      .returning({
        id: taskMasters.id,
        name: taskMasters.name,
        description: taskMasters.description,
        startDate: taskMasters.startDate,
        endDate: taskMasters.endDate,
        targetUser: taskMasters.targetUser,
        createdBy: taskMasters.createdBy,
      });

    if (!taskMaster) {
      throw new Error("Failed to update task master");
    }

    const effectiveDayStart = parseCalendarDayInZone(
      taskMasterInput.effectiveFrom,
    );
    const materializedInstances = await tx.query.taskInstances.findMany({
      where: and(
        eq(taskInstances.taskMasterId, taskMaster.id),
        gte(taskInstances.targetDate, effectiveDayStart),
      ),
      columns: {
        id: true,
        targetDate: true,
        endDate: true,
        status: true,
        isDeleted: true,
      },
    });
    const activeMaterialized = materializedInstances.filter(
      (instance) => !instance.isDeleted && instance.targetDate,
    );
    const existingPending = activeMaterialized.flatMap((instance) =>
      instance.status === "pending" && instance.targetDate
        ? [
            {
              id: instance.id,
              targetDate: instance.targetDate,
              endDate: instance.endDate,
            },
          ]
        : [],
    );
    const occupiedTargetDates = activeMaterialized.flatMap((instance) =>
      instance.status !== "pending" && instance.targetDate
        ? [instance.targetDate]
        : [],
    );
    const existingPendingTargetDateById = new Map(
      existingPending.map((instance) => [instance.id, instance.targetDate]),
    );
    const horizonTargetDate = activeMaterialized.reduce<Date | undefined>(
      (latest, instance) =>
        instance.targetDate && (!latest || instance.targetDate > latest)
          ? instance.targetDate
          : latest,
      undefined,
    );
    const cadenceChanged = !hasSameRecurrenceCadence(
      oldFreq.rruleString,
      nextRruleString,
    );
    const desired =
      cadenceChanged && horizonTargetDate
        ? await taskInstanceRepo.generateVirtualTaskInstances({
            userId: nextTargetUser,
            taskMasterId: taskMaster.id,
            rruleString: nextRruleString,
            startDate: nextStartDate,
            masterEndDate: nextEndDate,
            from: effectiveDayStart,
            to: new Date(
              parseCalendarDayInZone(
                calendarDateKeyInAppZone(horizonTargetDate),
              ).getTime() +
                24 * 60 * 60 * 1000 -
                1,
            ),
          })
        : [];
    const reconciliationPlan = buildPendingInstanceReconciliation({
      cadenceChanged,
      existing: existingPending,
      desired,
      occupiedTargetDates,
      newMasterStartDate: nextStartDate,
      newMasterEndDate: nextEndDate,
    });
    const now = new Date();
    const archivedPendingIdsBlockingReconciliation =
      getArchivedPendingInstanceIdsBlockingSchedules({
        materialized: materializedInstances,
        schedules: [
          ...reconciliationPlan.updates,
          ...reconciliationPlan.creates,
        ],
      });
    for (const id of archivedPendingIdsBlockingReconciliation) {
      await tx
        .update(taskInstances)
        .set({ targetDate: null, updatedAt: now })
        .where(eq(taskInstances.id, id));
    }

    for (const update of reconciliationPlan.updates) {
      await tx
        .update(taskInstances)
        .set({
          userId: nextTargetUser,
          name: nextName,
          description: nextDescription,
          targetDate: update.targetDate,
          endDate: update.endDate,
          updatedAt: now,
        })
        .where(eq(taskInstances.id, update.id));
    }

    if (reconciliationPlan.archives.length > 0) {
      for (const id of reconciliationPlan.archives) {
        await tx
          .update(taskInstances)
          .set({
            isDeleted: true,
            targetDate: null,
            deleteAt: now,
            deleteBy: taskMasterInput.userId,
            updatedAt: now,
          })
          .where(eq(taskInstances.id, id));
      }
    }

    const createdInstanceIds: string[] = [];
    for (const schedule of reconciliationPlan.creates) {
      const [created] = await tx
        .insert(taskInstances)
        .values({
          userId: nextTargetUser,
          taskMasterId: taskMaster.id,
          name: nextName,
          description: nextDescription,
          targetDate: schedule.targetDate,
          actualDate: null,
          endDate: schedule.endDate,
          status: "pending",
        })
        .onConflictDoNothing({
          target: [
            taskInstances.userId,
            taskInstances.taskMasterId,
            taskInstances.targetDate,
          ],
        })
        .returning({ id: taskInstances.id });

      if (!created) {
        throw new Error(
          "TASK_MASTER_SCHEDULE_CONFLICT: A task already exists at the requested time",
        );
      }

      createdInstanceIds.push(created.id);
      await cloneMasterRewardTemplateToInstanceInTransaction(tx, {
        taskMasterId: taskMaster.id,
        taskInstanceId: created.id,
        createdBy: taskMasterInput.userId,
      });
    }

    const reconciliation = {
      updatedPending: reconciliationPlan.updates.length,
      archivedPending: reconciliationPlan.archives.length,
      createdPending: createdInstanceIds.length,
      retainedPending: reconciliationPlan.retainedPending,
    };
    const auditMetadata = {
      effectiveFrom: taskMasterInput.effectiveFrom,
      oldSchedule: {
        startDate: existingTaskMaster.startDate.toISOString(),
        endDate: existingTaskMaster.endDate.toISOString(),
        rruleString: oldFreq.rruleString,
      },
      newSchedule: {
        startDate: nextStartDate.toISOString(),
        endDate: nextEndDate.toISOString(),
        rruleString: nextRruleString,
      },
      reconciliation,
    };

    const scheduleActivities = [];
    if (nextStartDate.getTime() !== existingTaskMaster.startDate.getTime()) {
      scheduleActivities.push({
        type: "start_date_changed" as const,
        taskMasterId: taskMaster.id,
        oldValue: existingTaskMaster.startDate.toISOString(),
        newValue: nextStartDate.toISOString(),
        createdBy: taskMasterInput.userId,
        metadata: auditMetadata,
      });
    }
    if (nextEndDate.getTime() !== existingTaskMaster.endDate.getTime()) {
      scheduleActivities.push({
        type: "deadline_changed" as const,
        taskMasterId: taskMaster.id,
        oldValue: existingTaskMaster.endDate.toISOString(),
        newValue: nextEndDate.toISOString(),
        createdBy: taskMasterInput.userId,
        metadata: auditMetadata,
      });
    }
    if (nextRruleString !== oldFreq.rruleString) {
      scheduleActivities.push({
        type: "updated_rruleString" as const,
        taskMasterId: taskMaster.id,
        oldValue: oldFreq.rruleString,
        newValue: nextRruleString,
        createdBy: taskMasterInput.userId,
        metadata: auditMetadata,
      });
    }
    scheduleActivities.push(
      ...reconciliationPlan.archives.map((id) => ({
        type: "archived" as const,
        taskInstanceId: id,
        oldValue: existingPendingTargetDateById.get(id)?.toISOString(),
        createdBy: taskMasterInput.userId,
        metadata: auditMetadata,
      })),
      ...createdInstanceIds.map((id) => ({
        type: "created" as const,
        taskInstanceId: id,
        createdBy: taskMasterInput.userId,
        metadata: auditMetadata,
      })),
    );
    if (scheduleActivities.length > 0) {
      await cardActivitesRepo.bulkCreateForTaskInstance(tx, scheduleActivities);
    }

    if (
      taskMasterInput.name !== undefined &&
      taskMasterInput.name !== existingTaskMaster.name
    ) {
      await cardActivitesRepo.bulkCreateForTaskInstance(tx, [
        {
          type: "updated_title",
          taskMasterId: taskMaster.id,
          oldValue: existingTaskMaster.name ?? undefined,
          newValue: taskMasterInput.name,
          createdBy: taskMasterInput.userId,
          metadata: auditMetadata,
        },
      ]);
    }

    if (
      taskMasterInput.description !== undefined &&
      taskMasterInput.description !== existingTaskMaster.description
    ) {
      const cardActivitesInsert = [
        {
          type: "updated_description" as const,
          taskMasterId: taskMaster.id,
          oldValue: existingTaskMaster.description ?? undefined,
          newValue: taskMasterInput.description ?? undefined,
          createdBy: taskMasterInput.userId,
          metadata: auditMetadata,
        },
      ];

      await cardActivitesRepo.bulkCreateForTaskInstance(
        tx,
        cardActivitesInsert,
      );
    }

    if (
      taskMasterInput.selectedUserId &&
      taskMasterInput.selectedUserId !== existingTaskMaster.targetUser
    ) {
      const cardActivitesInsert = [
        {
          type: "member_assigned" as const,
          taskMasterId: taskMaster.id,
          oldValue: existingTaskMaster.targetUser,
          newValue: taskMasterInput.selectedUserId,
          createdBy: taskMasterInput.userId,
          metadata: auditMetadata,
        },
      ];

      await cardActivitesRepo.bulkCreateForTaskInstance(
        tx,
        cardActivitesInsert,
      );
    }

    return { taskMaster, reconciliation };
  });
};

export const softDelete = async (
  db: dbClient,
  taskMasterInput: {
    id: string;
    userId: string;
  },
) => {
  const [taskMaster] = await db
    .update(taskMasters)
    .set({
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: taskMasterInput.userId,
      updatedAt: new Date(),
    })
    .where(eq(taskMasters.id, taskMasterInput.id))
    .returning({
      id: taskMasters.id,
      freqId: taskMasters.freqId,
    });

  if (!taskMaster) {
    throw new Error("Failed to delete task instance");
  }

  await db.insert(cardActivities).values({
    publicId: generateUID(),
    taskMasterId: taskMaster.id,
    type: "archived",
    createdBy: taskMasterInput.userId,
    createdAt: new Date(),
  });

  return taskMaster;
};
