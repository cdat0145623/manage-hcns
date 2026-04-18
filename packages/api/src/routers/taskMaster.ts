import {TRPCError} from "@trpc/server";
import {protectedProcedure, createTRPCRouter} from "../trpc";
import {generateUID} from "@kan/shared/utils";
import {z} from "zod";
import { RRule } from 'rrule';
import { eq } from "drizzle-orm";

import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import { taskMasters, taskInstances } from "@kan/db/schema";
import {
  trackTaskInstanceRewardViolations,
} from "../utils/rewardViolation";

export const taskMasterRouter = createTRPCRouter({
  create: protectedProcedure
  .meta({
    openapi: {
        summary: "Create a task master",
        method: "POST",
        path: "/task-master",
        description: "Create a task master",
        tags: ["taskMaster"],
        protect: true,
    }
  })
  .input(
    z.object({
      name: z.string(),
      description: z.string(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      selectedUserId: z.string(),
      rruleString: z.string(),
      from: z.coerce.date(),
      to: z.coerce.date(),
    })
  )
  .mutation(async ({ctx, input}) => {
    const userId = ctx.user?.id;

    if (!userId) {
      throw new TRPCError({
        message: `User not authenticated`,
        code: "UNAUTHORIZED",
      });
    }

    const {name, description, startDate, endDate, selectedUserId, rruleString, from, to } = input;

    const taskMaster = await taskMasterRepo.create(ctx.db, {
      userId: userId,
      name,
      description,
      startDate,
      endDate,
      selectedUserId,
      rruleString,
    });

    const virtualTaskInstances = await taskInstanceRepo.generateVirtualTaskInstances({
      userId: userId,
      taskMasterId: taskMaster.id,
      rruleString,
      startDate,
      masterEndDate: taskMaster.endDate,
      from,
      to,
    });

    const newVirtualTaskInstances = virtualTaskInstances.map((taskInstance) => {
      return {
        ...taskInstance,
        selectedUserId: taskMaster.targetUser,
        startDate: taskMaster.startDate,
      };
    });

    return newVirtualTaskInstances;
  }),
  update: protectedProcedure
  .meta({
    openapi: {
        summary: "Update a task master",
        method: "PUT",
        path: "/task-master",
        description: "Update a task master",
        tags: ["taskMaster"],
        protect: true,
    }
  })
  .input(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
      selectedUserId: z.string().optional(),
      rruleString: z.string().optional(),
    })
  )
  .mutation(async ({ctx, input}) => {
    const userId = ctx.user?.id;

    if (!userId) {
      throw new TRPCError({
        message: `User not authenticated`,
        code: "UNAUTHORIZED",
      });
    }

    const {id, name, description, startDate, endDate, selectedUserId, rruleString} = input;

    // Snapshot previous values before update (for violation comparison)
    const previousMaster = await ctx.db.query.taskMasters.findFirst({
      where: eq(taskMasters.id, id),
    });

    const taskMaster = await taskMasterRepo.update(ctx.db, {
      id,
      name,
      description,
      startDate,
      endDate,
      selectedUserId,
      rruleString,
      userId,
    });

    const taskInstancesList = await ctx.db.query.taskInstances.findMany({
      where: (t, { eq }) => eq(t.taskMasterId, id),
    });

    const updatedTaskInstances = taskInstancesList.map(async (taskInstance) => {
      const instanceEndDate = new Date(taskInstance.targetDate!);
      instanceEndDate.setHours(taskMaster.endDate.getHours());
      instanceEndDate.setMinutes(taskMaster.endDate.getMinutes());
      instanceEndDate.setSeconds(taskMaster.endDate.getSeconds());
      instanceEndDate.setMilliseconds(taskMaster.endDate.getMilliseconds());

      await taskInstanceRepo.update(ctx.db, {
        id: taskInstance.id,
        taskMasterId: id,
        userId: userId,
        name: taskMaster.name!,
        description: taskMaster.description!,
        status: taskInstance.status,
        endDate: instanceEndDate,
      });
    });

    // ── Reward violation tracking (non-blocking, fire-and-forget) ──────────────
    const endDateChanged = endDate !== undefined &&
      previousMaster?.endDate?.getTime() !== endDate?.getTime();
    const assigneeChanged = selectedUserId !== undefined &&
      previousMaster?.targetUser !== selectedUserId;
 
    if (endDateChanged || assigneeChanged) {
      for (const inst of taskInstancesList) {
        const instEndDate = new Date(inst.targetDate!);
        const endTime = endDate ?? previousMaster!.endDate;
        instEndDate.setHours(endTime.getHours());
        instEndDate.setMinutes(endTime.getMinutes());
        instEndDate.setSeconds(endTime.getSeconds());
        instEndDate.setMilliseconds(endTime.getMilliseconds());

        trackTaskInstanceRewardViolations({
          db: ctx.db,
          taskInstanceId: inst.id,
          newDueDate: instEndDate,
          newStartDate: inst.targetDate,
          newTargetUser: selectedUserId ?? inst.userId,
        }).catch(() => void 0);
      }
    }
    // ───────────────────────────────────────────────────────────────────

    return taskMaster;
  })
})