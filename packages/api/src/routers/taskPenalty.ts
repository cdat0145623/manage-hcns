import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  groupPenaltyPolicies,
  saveGlobalPenaltyPolicy,
  TASK_PENALTY_PRIORITIES,
} from "@kan/db/repository/taskPenaltyPolicy.repo";
import {
  taskMasterPenaltyPolicies,
  taskPenaltyPolicies,
  users,
} from "@kan/db/schema";
import {
  calendarDateKeyInAppZone,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const prioritySchema = z.enum(TASK_PENALTY_PRIORITIES);
const amountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const startOfCalendarDayInAppZone = (date: Date) =>
  parseCalendarDayInZone(calendarDateKeyInAppZone(date));

const endOfCalendarDayInAppZone = (date: Date) => {
  const end = startOfCalendarDayInAppZone(date);
  end.setUTCDate(end.getUTCDate() + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return end;
};

const assertSystemAdmin = async (
  db: Parameters<typeof saveGlobalPenaltyPolicy>[0],
  userId: string,
) => {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  if (user?.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin access required",
    });
  }
};

export const taskPenaltyRouter = createTRPCRouter({
  settings: protectedProcedure
    .meta({
      openapi: {
        summary: "Get daily task penalty settings",
        method: "GET",
        path: "/task-penalty/settings",
        tags: ["taskPenalty"],
        protect: true,
      },
    })
    .query(async ({ ctx }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertSystemAdmin(ctx.db, userId);
      const asOf = new Date();
      const policies = await ctx.db.query.taskPenaltyPolicies.findMany({
        columns: {
          publicId: true,
          priority: true,
          amountVnd: true,
          source: true,
          effectiveFrom: true,
          effectiveTo: true,
          revision: true,
          supersededAt: true,
          createdAt: true,
        },
        orderBy: [
          asc(taskPenaltyPolicies.priority),
          asc(taskPenaltyPolicies.effectiveFrom),
        ],
      });
      return {
        asOf,
        priorities: groupPenaltyPolicies(policies, asOf),
      };
    }),
  saveGlobalPolicy: protectedProcedure
    .meta({
      openapi: {
        summary: "Save a global daily task penalty policy",
        method: "POST",
        path: "/task-penalty/global-policy",
        tags: ["taskPenalty"],
        protect: true,
      },
    })
    .input(
      z
        .object({
          priority: prioritySchema,
          amountVnd: amountSchema,
          effectiveFrom: z.coerce.date(),
          effectiveTo: z.coerce.date(),
          policyPublicId: z.string().length(12).optional(),
        })
        .superRefine((input, context) => {
          if (
            startOfCalendarDayInAppZone(input.effectiveTo) <
            startOfCalendarDayInAppZone(input.effectiveFrom)
          ) {
            context.addIssue({
              code: "custom",
              path: ["effectiveTo"],
              message: "End date must not precede start date",
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertSystemAdmin(ctx.db, userId);
      return saveGlobalPenaltyPolicy(ctx.db, {
        ...input,
        effectiveFrom: startOfCalendarDayInAppZone(input.effectiveFrom),
        effectiveTo: endOfCalendarDayInAppZone(input.effectiveTo),
        createdBy: userId,
      });
    }),
  getMasterPolicy: protectedProcedure
    .meta({
      openapi: {
        summary: "Get a master daily task penalty policy",
        method: "GET",
        path: "/task-penalty/master-policy/{taskMasterId}",
        tags: ["taskPenalty"],
        protect: true,
      },
    })
    .input(z.object({ taskMasterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertSystemAdmin(ctx.db, userId);
      const asOf = new Date();
      const [versions, defaults] = await Promise.all([
        ctx.db.query.taskMasterPenaltyPolicies.findMany({
          where: eq(taskMasterPenaltyPolicies.taskMasterId, input.taskMasterId),
          columns: {
            publicId: true,
            priority: true,
            overrideAmountVnd: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
          orderBy: [asc(taskMasterPenaltyPolicies.effectiveFrom)],
        }),
        ctx.db.query.taskPenaltyPolicies.findMany({
          columns: {
            publicId: true,
            priority: true,
            amountVnd: true,
            source: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
          orderBy: [asc(taskPenaltyPolicies.effectiveFrom)],
        }),
      ]);
      const current = versions
        .filter(
          (policy) =>
            policy.effectiveFrom <= asOf &&
            (!policy.effectiveTo || policy.effectiveTo >= asOf),
        )
        .at(-1);

      return {
        asOf,
        current: current ?? null,
        scheduled: versions.filter((policy) => policy.effectiveFrom > asOf),
        history: versions
          .filter(
            (policy) =>
              policy.effectiveTo !== null && policy.effectiveTo < asOf,
          )
          .reverse(),
        defaults: groupPenaltyPolicies(defaults, asOf).map((policy) => ({
          priority: policy.priority,
          current: policy.current,
        })),
      };
    }),
});
