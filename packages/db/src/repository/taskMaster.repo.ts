import { eq } from "drizzle-orm";

import type { dbClient } from "@kan/db/client";
import { cardActivities, frequences, taskMasters } from "@kan/db/schema";
import { generateUID } from "@kan/shared/utils";

import type { MasterPenaltyPolicyInput } from "./taskPenaltyPolicy.repo";
import * as cardActivitesRepo from "./cardActivity.repo";
import * as frequenceRepo from "./frequence.repo";
import { reconcilePendingPenaltySnapshots } from "./taskPenaltyPolicy.repo";

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
    penaltyPolicy?:
      | { priority: null }
      | { priority: "high" | "medium" | "low"; amountMode: "default" }
      | {
          priority: "high" | "medium" | "low";
          amountMode: "override";
          overrideAmountVnd: number;
        };
  },
) => {
  return await db.transaction(async (tx) => {
    const frequence = await frequenceRepo.create(tx, {
      name: taskMasterInput.rruleString,
      rrule: taskMasterInput.rruleString,
      dtStart: taskMasterInput.startDate,
    });

    if (!frequence) {
      throw new Error("Failed to create frequency");
    }

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
        priority: taskMasterInput.penaltyPolicy?.priority ?? null,
        publicId: generateUID(),
        penaltyOverrideAmountVnd:
          taskMasterInput.penaltyPolicy?.priority &&
          taskMasterInput.penaltyPolicy.amountMode === "override"
            ? taskMasterInput.penaltyPolicy.overrideAmountVnd
            : null,
      })
      .returning({
        id: taskMasters.id,
        publicId: taskMasters.publicId,
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
    penaltyPolicy?: {
      policy: MasterPenaltyPolicyInput;
      priorityChangeAction?: "keep_override" | "use_new_default";
    };
  },
) => {
  return await db.transaction(async (tx) => {
    const existingTaskMaster = await tx.query.taskMasters.findFirst({
      where: eq(taskMasters.id, taskMasterInput.id),
    });

    if (!existingTaskMaster) {
      throw new Error("Task master not found");
    }

    const oldFreq = await tx.query.frequences.findFirst({
      where: eq(frequences.id, existingTaskMaster.freqId),
    });

    if (!oldFreq) {
      throw new Error("Frequency not found");
    }

    let nextPenaltyPolicy = taskMasterInput.penaltyPolicy?.policy;
    if (taskMasterInput.penaltyPolicy) {
      const priorityChanged =
        existingTaskMaster.priority !== nextPenaltyPolicy?.priority;
      if (
        priorityChanged &&
        existingTaskMaster.penaltyOverrideAmountVnd !== null &&
        existingTaskMaster.penaltyOverrideAmountVnd !== undefined
      ) {
        if (!taskMasterInput.penaltyPolicy.priorityChangeAction) {
          throw new Error(
            "priorityChangeAction is required when changing a priority with an override",
          );
        }
        if (
          taskMasterInput.penaltyPolicy.priorityChangeAction ===
            "keep_override" &&
          nextPenaltyPolicy?.priority
        ) {
          nextPenaltyPolicy = {
            priority: nextPenaltyPolicy.priority,
            amountMode: "override",
            overrideAmountVnd: existingTaskMaster.penaltyOverrideAmountVnd,
          };
        }
      }
    }

    let frequence;
    if (taskMasterInput.rruleString) {
      frequence = await frequenceRepo.update(tx, {
        id: existingTaskMaster.freqId,
        name: taskMasterInput.rruleString,
        rrule: taskMasterInput.rruleString,
        dtStart: taskMasterInput.startDate,
      });

      if (!frequence) {
        throw new Error("Failed to update frequency");
      }
    }

    // 2. Tạo task master
    const [taskMaster] = await tx
      .update(taskMasters)
      .set({
        targetUser: taskMasterInput.selectedUserId,
        name: taskMasterInput.name,
        description: taskMasterInput.description,
        startDate: taskMasterInput.startDate,
        endDate: taskMasterInput.endDate,
        freqId: frequence?.id || oldFreq.id,
        ...(taskMasterInput.penaltyPolicy
          ? {
              priority: nextPenaltyPolicy?.priority ?? null,
              penaltyOverrideAmountVnd:
                nextPenaltyPolicy?.priority &&
                nextPenaltyPolicy.amountMode === "override"
                  ? nextPenaltyPolicy.overrideAmountVnd
                  : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(taskMasters.id, taskMasterInput.id))
      .returning({
        id: taskMasters.id,
        publicId: taskMasters.publicId,
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

    if (taskMasterInput.penaltyPolicy) {
      await reconcilePendingPenaltySnapshots(tx, {
        taskMasterId: taskMaster.id,
        actorUserId: taskMasterInput.userId,
      });
    }

    if (
      taskMasterInput.rruleString &&
      taskMasterInput.rruleString !== oldFreq.rruleString
    ) {
      const cardActivitesInsert = [
        {
          type: "updated_rruleString" as const,
          taskMasterId: taskMaster.id,
          oldValue: oldFreq.rruleString ?? undefined,
          newValue: taskMasterInput.rruleString ?? undefined,
          createdBy: taskMasterInput.userId,
        },
      ];

      await cardActivitesRepo.bulkCreateForTaskInstance(
        tx,
        cardActivitesInsert,
      );
    }

    if (
      taskMasterInput.description &&
      taskMasterInput.description !== existingTaskMaster.description
    ) {
      const cardActivitesInsert = [
        {
          type: "updated_description" as const,
          taskMasterId: taskMaster.id,
          oldValue: existingTaskMaster.description ?? undefined,
          newValue: taskMasterInput.description ?? undefined,
          createdBy: taskMasterInput.userId,
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
        },
      ];

      await cardActivitesRepo.bulkCreateForTaskInstance(
        tx,
        cardActivitesInsert,
      );
    }

    return taskMaster;
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
