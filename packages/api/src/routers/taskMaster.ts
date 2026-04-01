import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const taskMasterRouter = createTRPCRouter({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        description: z.string(),
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        selectedUserId: z.string(),
        rruleString: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      return taskMasterRepo.create(ctx.db, {
        userId,
        name: input.name,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        selectedUserId: input.selectedUserId,
        rruleString: input.rruleString,
      });
    }),

  update: protectedProcedure
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return taskMasterRepo.update(ctx.db, input);
    }),
});
