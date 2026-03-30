import { z } from "zod";

import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";

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
      },
    })
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        startDate: z.date(),
        endDate: z.date(),
        selectedUserId: z.string(),
        rruleString: z.string().optional().nullable(),
        createdBy: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
        createdBy,
      } = input;

      return taskMasterRepo.create(ctx.db, {
        userId: createdBy,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString: rruleString ?? "",
      });
    }),
});
