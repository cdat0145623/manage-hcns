import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import * as cardRepo from "@kan/db/repository/card.repo";
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import { cards, taskInstances } from "@kan/db/schema";
import { createLogger } from "@kan/logger";

import { adminProcedure, createTRPCRouter } from "../trpc";

const logger = createLogger("cron");

export const cronRouter = createTRPCRouter({
  updateMissedStatuses: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/cron/update-missed-statuses",
        summary: "Update missed statuses for cards and task instances",
        description:
          "Updates status to 'missed' for cards with past dueDate and task instances with past targetDate that are still in 'pending' status",
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
      console.log("updateMissedStatuses")
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

        const pendingTaskInstancesWithPastTargetDate = await db
          .select({
            id: taskInstances.id,
            status: taskInstances.status,
          })
          .from(taskInstances)
          .where(
            and(
              eq(taskInstances.status, "pending" as const),
              eq(taskInstances.isDeleted, false),
              lt(taskInstances.targetDate, now),
            ),
          );

        for (const taskInstance of pendingTaskInstancesWithPastTargetDate) {
          const result = await taskInstanceRepo.updateStatusById(
            db,
            taskInstance.id,
            "missed",
          );
          if (result) {
            taskInstancesUpdated++;
          }
        }

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
