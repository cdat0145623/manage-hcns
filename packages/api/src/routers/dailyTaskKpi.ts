import { TRPCError } from "@trpc/server";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";

import {
  getDailyTaskKpiExclusions,
  saveDailyTaskKpiExclusionChanges,
} from "@kan/db/repository/dailyTaskKpi.repo";
import { generateVirtualTaskInstances } from "@kan/db/repository/taskInstance.repo";
import { taskInstances, taskMasters, users } from "@kan/db/schema";
import {
  calendarDateKeyInAppZone,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertSystemAdmin } from "../utils/assert-system-admin";

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const occurrenceKeySchema = z.object({
  taskMasterId: z.string().uuid(),
  occurrenceDate: calendarDateSchema,
});

const isValidTaskOccurrence = async (
  db: Parameters<typeof getDailyTaskKpiExclusions>[0],
  input: { targetUserId: string; taskMasterId: string; occurrenceDate: string },
): Promise<boolean> => {
  const from = parseCalendarDayInZone(input.occurrenceDate);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setUTCMilliseconds(to.getUTCMilliseconds() - 1);

  const storedTaskInstance = await db.query.taskInstances.findFirst({
    columns: { id: true },
    where: and(
      eq(taskInstances.taskMasterId, input.taskMasterId),
      eq(taskInstances.userId, input.targetUserId),
      eq(taskInstances.isDeleted, false),
      gte(taskInstances.targetDate, from),
      lte(taskInstances.targetDate, to),
    ),
  });
  if (storedTaskInstance) return true;

  const taskMaster = await db.query.taskMasters.findFirst({
    where: and(
      eq(taskMasters.id, input.taskMasterId),
      eq(taskMasters.targetUser, input.targetUserId),
      eq(taskMasters.isDeleted, false),
    ),
    with: { frequence: true },
  });
  if (!taskMaster?.frequence.rruleString) return false;

  const occurrences = await generateVirtualTaskInstances({
    userId: input.targetUserId,
    taskMasterId: taskMaster.id,
    rruleString: taskMaster.frequence.rruleString,
    startDate: taskMaster.startDate,
    masterEndDate: taskMaster.endDate,
    from,
    to,
  });

  return occurrences.some(
    (occurrence: { targetDate: Date }) =>
      calendarDateKeyInAppZone(occurrence.targetDate) === input.occurrenceDate,
  );
};

export const dailyTaskKpiRouter = createTRPCRouter({
  exclusions: protectedProcedure
    .meta({
      openapi: {
        summary: "Get daily task KPI exclusions",
        method: "GET",
        path: "/daily-task-kpi/exclusions",
        tags: ["dailyTaskKpi"],
        protect: true,
      },
    })
    .input(
      z.object({
        targetUserId: z.string().uuid(),
        from: calendarDateSchema,
        to: calendarDateSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      if (userId !== input.targetUserId) {
        await assertSystemAdmin(ctx.db, userId);
      }
      return getDailyTaskKpiExclusions(ctx.db, input);
    }),
  saveChanges: protectedProcedure
    .meta({
      openapi: {
        summary: "Save daily task KPI exclusion changes",
        method: "POST",
        path: "/daily-task-kpi/exclusions",
        tags: ["dailyTaskKpi"],
        protect: true,
      },
    })
    .input(
      z.object({
        targetUserId: z.string().uuid(),
        exclude: z.array(
          occurrenceKeySchema.extend({
            reason: z.string().max(2000).optional(),
          }),
        ),
        include: z.array(occurrenceKeySchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertSystemAdmin(ctx.db, userId);

      const uniqueOccurrences = Array.from(
        new Map(
          input.exclude.map((occurrence) => [
            `${occurrence.taskMasterId}:${occurrence.occurrenceDate}`,
            occurrence,
          ]),
        ).values(),
      );
      const validOccurrences = await Promise.all(
        uniqueOccurrences.map((occurrence) =>
          isValidTaskOccurrence(ctx.db, {
            targetUserId: input.targetUserId,
            taskMasterId: occurrence.taskMasterId,
            occurrenceDate: occurrence.occurrenceDate,
          }),
        ),
      );
      if (validOccurrences.some((isValid) => !isValid)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more task occurrences are invalid",
        });
      }

      await saveDailyTaskKpiExclusionChanges(ctx.db, {
        targetUserId: input.targetUserId,
        actorUserId: userId,
        exclude: input.exclude,
        include: input.include,
      });
      return { success: true };
    }),
});
