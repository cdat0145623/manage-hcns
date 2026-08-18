import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import { materializeTaskInstances } from "@kan/db/repository/taskInstanceMaterializer.repo";
import { markOverdueTaskInstancesMissed } from "@kan/db/repository/taskInstanceStatus.repo";
import { cards } from "@kan/db/schema";
import { createLogger } from "@kan/logger";
import { calendarDateKeyInAppZone } from "@kan/shared/utils";

import { adminProcedure, createTRPCRouter } from "../trpc";

const logger = createLogger("cron");

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
});
