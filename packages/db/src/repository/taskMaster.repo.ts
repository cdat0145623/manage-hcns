import { eq } from "drizzle-orm";
import { taskMasters, frequences, cardActivities } from "@kan/db/schema";
import type { dbClient } from "@kan/db/client";
import { generateUID } from "@kan/shared/utils";

import * as frequenceRepo from "./frequence.repo";
import * as cardActivitesRepo from "./cardActivity.repo";

export const create = async (
  db: dbClient,
  taskMasterInput: {
    userId: string,
    name: string,
    description: string,
    startDate: Date,
    endDate: Date,
    selectedUserId: string,
    rruleString: string,
  }
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
      createdBy: taskMasterInput.userId
    });

    await tx.insert(cardActivities).values({
      publicId: generateUID(),
      freqId: frequence.id,
      type: "created",
      createdBy: taskMasterInput.userId
    });

    return taskMaster;
  });
};

export const update = async (
  db: dbClient,
  taskMasterInput: {
    id: string,
    name?: string,
    description?: string,
    startDate?: Date,
    endDate?: Date,
    selectedUserId?: string,
    rruleString?: string,
    userId: string,
  }
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

    const frequence = await frequenceRepo.update(tx, {
      id: existingTaskMaster.freqId,
      name: taskMasterInput.rruleString,
      rrule: taskMasterInput.rruleString,
      dtStart: taskMasterInput.startDate,
    });

    if (!frequence) {
      throw new Error("Failed to update frequency");
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
        freqId: frequence.id,
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

    if (taskMasterInput.rruleString !== oldFreq.rruleString) {
      const cardActivitesInsert = [{
        type: "updated_index" as const,
        taskInstanceId: taskMaster.id,
        oldValue: oldFreq.rruleString ?? undefined,
        newValue: taskMasterInput.rruleString ?? undefined,
        createdBy: taskMasterInput.userId,
      }];

      await cardActivitesRepo.bulkCreateForTaskInstance(tx, cardActivitesInsert);
    }

    if (taskMasterInput.description !== existingTaskMaster.description) {
      const cardActivitesInsert = [{
        type: "updated_description" as const,
        taskInstanceId: taskMaster.id,
        oldValue: existingTaskMaster.description ?? undefined,
        newValue: taskMasterInput.description ?? undefined,
        createdBy: taskMasterInput.userId,
      }];

      await cardActivitesRepo.bulkCreateForTaskInstance(tx, cardActivitesInsert);
    }

    if (taskMasterInput.selectedUserId !== existingTaskMaster.targetUser) {
      const cardActivitesInsert = [{
        type: "member_assigned" as const,
        taskInstanceId: taskMaster.id,
        oldValue: existingTaskMaster.targetUser,
        newValue: taskMasterInput.selectedUserId,
        createdBy: taskMasterInput.userId,
      }];

      await cardActivitesRepo.bulkCreateForTaskInstance(tx, cardActivitesInsert);
    }

    return taskMaster;
  });
};

export const softDelete = async (
    db: dbClient,
    taskMasterInput: {
        id: string,
        userId: string,
    }
) => {
    const [taskMaster] = await db
    .update(taskMasters)
    .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: taskMasterInput.userId,
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
      freqId: taskMaster.freqId,
      type: "archived",
      createdBy: taskMasterInput.userId,
      createdAt: new Date()
    });

    return taskMaster;
}