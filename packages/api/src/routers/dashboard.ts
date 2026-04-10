import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as dashboardRepo from "@kan/db/repository/dashboard.repo";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const dashboardRouter = createTRPCRouter({
  get: protectedProcedure
    .meta({
      openapi: {
        summary: "Get dashboard metrics",
        method: "GET",
        path: "/dashboard",
        description:
          "Returns KPI metrics for Kanban (card distribution, deadline rate) and Calendar (task completion, deadline rate, progress breakdown).",
        tags: ["Dashboard"],
        protect: true,
      },
    })
    .input(
      z.object({
        selectedUserId: z.string(),
        boardPublicId: z.string().optional(),
        viewMode: z.enum(["week", "month", "year"]).optional(),
        month: z.number().min(1).max(12).optional(),
        week: z.number().min(1).max(53).optional(),
        year: z.number().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const result: {
        kanban?: {
          cardDistributionByList: Awaited<
            ReturnType<typeof dashboardRepo.getCardDistributionByBoard>
          >;
          deadlineCompletionRate: Awaited<
            ReturnType<typeof dashboardRepo.getKanbanDeadlineRate>
          >;
        };
        calendar?: Awaited<ReturnType<typeof dashboardRepo.getCalendarMetrics>>;
      } = {};

      // ── Kanban section ─────────────────────────────────────────
      if (input.boardPublicId) {
        const [distribution, deadlineRate] = await Promise.all([
          dashboardRepo.getCardDistributionByBoard(ctx.db, {
            boardPublicId: input.boardPublicId,
            selectedUserId: input.selectedUserId,
          }),
          dashboardRepo.getKanbanDeadlineRate(ctx.db, {
            boardPublicId: input.boardPublicId,
            selectedUserId: input.selectedUserId,
          }),
        ]);

        result.kanban = {
          cardDistributionByList: distribution,
          deadlineCompletionRate: deadlineRate,
        };
      }

      // ── Calendar section ───────────────────────────────────────
      const year = input.year ?? new Date().getFullYear();
      const viewMode = input.viewMode ?? "month";
      
      result.calendar = await dashboardRepo.getCalendarMetrics(ctx.db, {
        selectedUserId: input.selectedUserId,
        viewMode,
        value: viewMode === "week" ? input.week : input.month,
        year,
      });

      return result;
    }),
});
