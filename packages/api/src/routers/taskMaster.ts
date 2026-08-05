import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
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
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        selectedUserId: z.string(),
        rruleString: z.string(),
        from: z.coerce.date(),
        to: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });
      }

      const {
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
        from,
        to,
      } = input;

      const taskMaster = await taskMasterRepo.create(ctx.db, {
        userId: userId,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
      });

      const virtualTaskInstances =
        await taskInstanceRepo.generateVirtualTaskInstances({
          userId: userId,
          taskMasterId: taskMaster.id,
          rruleString,
          startDate,
          masterEndDate: taskMaster.endDate,
          from,
          to,
        });

      const newVirtualTaskInstances = virtualTaskInstances.map(
        (taskInstance) => {
          return {
            ...taskInstance,
            selectedUserId: taskMaster.targetUser,
            startDate: taskMaster.startDate,
          };
        },
      );

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
      },
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });
      }

      const {
        id,
        name,
        description,
        startDate,
        endDate,
        selectedUserId,
        rruleString,
      } = input;

      // Only persist template changes on taskMasters. Existing taskInstances keep
      // their snapshot (dates, title, assignee on the row) until edited via taskInstance.update.
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
    }),
});
