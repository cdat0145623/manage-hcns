import {TRPCError} from "@trpc/server";
import {protectedProcedure, createTRPCRouter} from "../trpc";
import {generateUID} from "@kan/shared/utils";
import {z} from "zod";
import { RRule } from 'rrule';

import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";

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
      from,
      to,
    });

    const newVirtualTaskInstances = virtualTaskInstances.map((taskInstance) => {
      return {
        ...taskInstance,
        selectedUserId: taskMaster.targetUser,
        startDate: taskMaster.startDate,
        endDate: taskMaster.endDate,
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

    return taskMasterRepo.update(ctx.db, {
        id,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
        userId,
      });
  })
})