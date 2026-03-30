import { taskMasters } from "@kan/db/schema";

import type { dbClient } from "@kan/db/client";

import * as frequenceRepo from "./frequence.repo";

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
      name: taskMasterInput.name,
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

    return taskMaster;
  });
};