import {TRPCError} from "@trpc/server";
import {protectedProcedure, createTRPCRouter} from "../trpc";
import {generateUID} from "@kan/shared/utils";
import {z} from "zod";
import { RRule } from 'rrule';

import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";

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
      startDate: z.date(),
      endDate: z.date(),
      selectedUserId: z.string(),
      freqId: z.string(),
      rruleString: z.string(),
      createdBy: z.string(),
    })
  )
  .mutation(async ({ctx, input}) => {
    const {name, description, startDate, endDate, selectedUserId, rruleString, createdBy} = input;

    return taskMasterRepo.create(ctx.db, {
        userId: createdBy,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
      });
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
      name: z.string(),
      description: z.string(),
      startDate: z.date(),
      endDate: z.date(),
      selectedUserId: z.string(),
      rruleString: z.string(),
      userId: z.string(),
    })
  )
  .mutation(async ({ctx, input}) => {
    const {id, name, description, startDate, endDate, selectedUserId, rruleString, userId} = input;

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