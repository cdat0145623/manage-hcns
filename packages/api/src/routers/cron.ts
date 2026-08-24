import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import { buildLocalDailyTaskSeedPlan } from "@kan/db/repository/localTaskSchedulerTest.repo";
import { materializeTaskInstances } from "@kan/db/repository/taskInstanceMaterializer.repo";
import { markOverdueTaskInstancesMissed } from "@kan/db/repository/taskInstanceStatus.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import { cards, taskInstances, taskMasters } from "@kan/db/schema";
import { createLogger } from "@kan/logger";
import { calendarDateKeyInAppZone } from "@kan/shared/utils";

import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";

const logger = createLogger("cron");

const localAdminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (process.env.ENABLE_LOCAL_TEST_TOOLS !== "true") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Local scheduler test tools are disabled",
    });
  }

  if (!ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const user = await userRepo.getById(ctx.db, ctx.user.id);
  if (user?.role !== "ADMIN") {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx });
});

export const cronRouter = createTRPCRouter({
  materializeTaskInstances: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/cron/materialize-task-instances",
        summary: "Create daily task instances",
        description:
          "Creates database task instances for scheduled task masters on a calendar day.",
        tags: ["Cron"],
        protect: true,
      },
    })
    .input(
      z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        taskMasterId: z.string().uuid().optional(),
        userId: z.string().uuid().optional(),
        dryRun: z.boolean().optional(),
      }),
    )
    .output(
      z.object({
        created: z.number(),
        skipped: z.number(),
        failed: z.number(),
        errors: z.array(
          z.object({
            taskMasterId: z.string(),
            message: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      materializeTaskInstances(ctx.db, {
        date: input.date ?? calendarDateKeyInAppZone(new Date()),
        taskMasterId: input.taskMasterId,
        userId: input.userId,
        dryRun: input.dryRun,
      }),
    ),
  updateMissedStatuses: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/cron/update-missed-statuses",
        summary: "Update missed statuses for cards and task instances",
        description:
          "Updates status to 'missed' for cards with past dueDate and task instances with past endDate that are still in 'pending' status",
        tags: ["Cron"],
        protect: true,
      },
    })
    .input(z.void())
    .output(
      z.object({
        cardsUpdated: z.number(),
        taskInstancesUpdated: z.number(),
      }),
    )
    .mutation(async ({ ctx }) => {
      const db = ctx.db;
      const now = new Date();
      let cardsUpdated = 0;
      let taskInstancesUpdated = 0;

      try {
        const pendingCardsWithPastDueDate = await db
          .select({
            id: cards.id,
            publicId: cards.publicId,
            status: cards.status,
          })
          .from(cards)
          .where(
            and(
              eq(cards.status, "pending" as const),
              isNull(cards.deletedAt),
              lt(cards.dueDate, now),
            ),
          );

        for (const card of pendingCardsWithPastDueDate) {
          const result = await cardRepo.updateStatusById(db, card.id, "missed");
          if (result) {
            cardsUpdated++;
          }
        }

        const taskInstanceResult = await markOverdueTaskInstancesMissed(db, {
          now,
        });
        taskInstancesUpdated = taskInstanceResult.updated;

        logger.info(
          { cardsUpdated, taskInstancesUpdated },
          "Completed missed status update",
        );

        return {
          cardsUpdated,
          taskInstancesUpdated,
        };
      } catch (error) {
        logger.error({ err: error }, "Failed to update missed statuses");
        throw error;
      }
    }),

  seedLocalDailyTasks: localAdminProcedure
    .input(
      z.object({
        count: z.number().int().min(1).max(100),
        userIds: z.array(z.string().uuid()).min(1).max(20),
        startDate: z.string(),
        endDate: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        batchId: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const actorUserId = ctx.user?.id;
      if (!actorUserId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const plan = buildLocalDailyTaskSeedPlan(input);
      const createdTaskMasterIds: string[] = [];

      for (const task of plan) {
        const created = await taskMasterRepo.create(ctx.db, {
          userId: actorUserId,
          name: task.name,
          description: task.description,
          startDate: task.startDate,
          endDate: task.endDate,
          selectedUserId: task.userId,
          rruleString: task.rruleString,
        });
        createdTaskMasterIds.push(created.id);
      }

      return {
        batchId: input.batchId,
        created: createdTaskMasterIds.length,
        taskMasterIds: createdTaskMasterIds,
      };
    }),

  runLocalScheduler: localAdminProcedure
    .input(
      z.object({
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        userId: z.string().uuid().optional(),
        taskMasterId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const materialized = await materializeTaskInstances(ctx.db, {
        date: input.date ?? calendarDateKeyInAppZone(new Date()),
        userId: input.userId,
        taskMasterId: input.taskMasterId,
      });
      const missed = await markOverdueTaskInstancesMissed(ctx.db, {
        now: new Date(),
      });

      return { materialized, missed };
    }),

  runLocalMissedStatusScheduler: localAdminProcedure
    .input(z.void())
    .mutation(async ({ ctx }) =>
      markOverdueTaskInstancesMissed(ctx.db, { now: new Date() }),
    ),

  cleanupLocalDailyTasks: localAdminProcedure
    .input(z.object({ batchId: z.string().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const masters = await ctx.db.query.taskMasters.findMany({
        columns: { id: true },
        where: and(
          eq(taskMasters.description, input.batchId),
          eq(taskMasters.isDeleted, false),
        ),
      });

      const masterIds = masters.map((master) => master.id);
      if (masterIds.length === 0) {
        return { batchId: input.batchId, taskMasters: 0, taskInstances: 0 };
      }

      const deletedAt = new Date();
      const actorUserId = ctx.user?.id;
      if (!actorUserId) throw new TRPCError({ code: "UNAUTHORIZED" });
      const deletedInstances = await ctx.db
        .update(taskInstances)
        .set({
          isDeleted: true,
          deleteAt: deletedAt,
          deleteBy: actorUserId,
        })
        .where(inArray(taskInstances.taskMasterId, masterIds))
        .returning({ id: taskInstances.id });

      const deletedMasters = await ctx.db
        .update(taskMasters)
        .set({
          isDeleted: true,
          deletedAt,
          deletedBy: actorUserId,
          updatedAt: deletedAt,
        })
        .where(inArray(taskMasters.id, masterIds))
        .returning({ id: taskMasters.id });

      return {
        batchId: input.batchId,
        taskMasters: deletedMasters.length,
        taskInstances: deletedInstances.length,
      };
    }),
});
