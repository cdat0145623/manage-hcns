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
    
  const frequence = await frequenceRepo.create(db, {
    name: taskMasterInput.name,
    rrule: taskMasterInput.rruleString,
    dtStart: taskMasterInput.startDate,
  });

  const [taskMaster] = await db.insert(taskMasters).values({
    targetUser: taskMasterInput.selectedUserId,
    name: taskMasterInput.name,
    description: taskMasterInput.description,
    startDate: taskMasterInput.startDate,
    endDate: taskMasterInput.endDate,
    createdBy: taskMasterInput.userId,
    freqId: frequence!.id,
  }).returning({
    id: taskMasters.id,
    name: taskMasters.name,
    description: taskMasters.description,
    startDate: taskMasters.startDate,
    endDate: taskMasters.endDate,
    targetUser: taskMasters.targetUser,
    createdBy: taskMasters.createdBy,
  });

  return taskMaster;
};