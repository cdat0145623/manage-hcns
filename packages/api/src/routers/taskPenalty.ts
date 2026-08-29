import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  groupPenaltyPolicies,
  resolveCurrentGlobalPenaltyPolicy,
  saveGlobalPenaltyPolicy,
  TASK_PENALTY_PRIORITIES,
} from "@kan/db/repository/taskPenaltyPolicy.repo";
import { getDailyTaskPenaltyStatistics } from "@kan/db/repository/taskPenaltyStatistics.repo";
import {
  taskMasterPenaltyPolicies,
  taskPenaltyPolicies,
  users,
} from "@kan/db/schema";
import { parseCalendarDayInZone } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const prioritySchema = z.enum(TASK_PENALTY_PRIORITIES);
const amountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

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
  statistics: protectedProcedure
    .meta({
      openapi: {
        summary: "Get daily task penalty statistics",
        method: "GET",
        path: "/task-penalty/statistics",
        tags: ["taskPenalty"],
        protect: true,
      },
    })
    .input(
      z.object({
        month: monthSchema,
        targetUserId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const requestedUserId = input.targetUserId ?? userId;
      if (requestedUserId !== userId) {
        const currentUser = await ctx.db.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { role: true },
        });
        if (currentUser?.role !== "ADMIN") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "User not authorized to view another user's penalties",
          });
        }
      }

      const from = parseCalendarDayInZone(`${input.month}-01`);
      const to = new Date(from);
      to.setUTCMonth(to.getUTCMonth() + 1);

      return getDailyTaskPenaltyStatistics(ctx.db, {
        from,
        to,
        targetUserId: input.targetUserId ?? undefined,
      });
    }),
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
        priorities: TASK_PENALTY_PRIORITIES.map((priority) => {
          const current = resolveCurrentGlobalPenaltyPolicy(policies, priority);
          return { priority, amountVnd: current?.amountVnd ?? null };
        }),
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
    .input(z.object({ priority: prioritySchema, amountVnd: amountSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
      await assertSystemAdmin(ctx.db, userId);
      return saveGlobalPenaltyPolicy(ctx.db, {
        ...input,
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
