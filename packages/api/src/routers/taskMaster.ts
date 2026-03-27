import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";

import { expandVirtualTasks } from "../services/taskScheduler";
import { assertUserInWorkspace } from "../utils/auth";
import { createTRPCRouter, protectedProcedure } from "../trpc";

// ---------------------------------------------------------------------------
// Zod schemas for recurrenceRule input validation
// ---------------------------------------------------------------------------

const weeklyRuleSchema = z.object({
  type: z.literal("weekly"),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "At least one day required"),
});

const monthlyWeekdayRuleSchema = z.object({
  type: z.literal("monthly_weekday"),
  week: z.number().int().min(1).max(5),
  dayOfWeek: z.number().int().min(0).max(6),
});

const monthlyDateRuleSchema = z.object({
  type: z.literal("monthly_date"),
  dayOfMonth: z.number().int().min(1).max(31),
});

const recurrenceRuleSchema = z.discriminatedUnion("type", [
  weeklyRuleSchema,
  monthlyWeekdayRuleSchema,
  monthlyDateRuleSchema,
]);

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const taskMasterRouter = createTRPCRouter({
  /**
   * Create a new TaskMaster (recurring task definition).
   */
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a recurring task master",
        method: "POST",
        path: "/workspaces/{workspacePublicId}/task-masters",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        recurrenceRule: recurrenceRuleSchema,
        defaultStartTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        defaultEndTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
      }),
    )
    .output(
      z.object({
        id: z.number(),
        publicId: z.string(),
        title: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace)
        throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      await assertUserInWorkspace(ctx.db, userId, workspace.id);

      const result = await taskMasterRepo.create(ctx.db, {
        workspaceId: workspace.id,
        title: input.title,
        description: input.description,
        recurrenceRule: input.recurrenceRule,
        defaultStartTime: input.defaultStartTime,
        defaultEndTime: input.defaultEndTime,
        createdBy: userId,
      });

      if (!result)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create task master",
        });

      return result;
    }),

  /**
   * Update an existing TaskMaster.
   */
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a recurring task master",
        method: "PUT",
        path: "/task-masters/{taskMasterPublicId}",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(
      z.object({
        taskMasterPublicId: z.string().min(12),
        title: z.string().min(1).max(500).optional(),
        description: z.string().optional(),
        recurrenceRule: recurrenceRuleSchema.optional(),
        defaultStartTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        defaultEndTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .output(z.object({ publicId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const master = await taskMasterRepo.getByPublicId(
        ctx.db,
        input.taskMasterPublicId,
      );
      if (!master)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task master not found" });

      await assertUserInWorkspace(ctx.db, userId, master.workspace.id);

      const result = await taskMasterRepo.update(ctx.db, master.id, {
        title: input.title,
        description: input.description,
        recurrenceRule: input.recurrenceRule,
        defaultStartTime: input.defaultStartTime,
        defaultEndTime: input.defaultEndTime,
        isActive: input.isActive,
      });

      if (!result)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update task master",
        });

      return { publicId: result.publicId };
    }),

  /**
   * Soft delete a TaskMaster.
   */
  delete: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a recurring task master",
        method: "DELETE",
        path: "/task-masters/{taskMasterPublicId}",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(z.object({ taskMasterPublicId: z.string().min(12) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const master = await taskMasterRepo.getByPublicId(
        ctx.db,
        input.taskMasterPublicId,
      );
      if (!master)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task master not found" });

      await assertUserInWorkspace(ctx.db, userId, master.workspace.id);

      await taskMasterRepo.softDelete(ctx.db, master.id);

      return { success: true };
    }),

  /**
   * List all TaskMasters for a workspace.
   */
  list: protectedProcedure
    .meta({
      openapi: {
        summary: "List recurring task masters in a workspace",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/task-masters",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(z.object({ workspacePublicId: z.string().min(12) }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace)
        throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      await assertUserInWorkspace(ctx.db, userId, workspace.id);

      return taskMasterRepo.getAllByWorkspaceId(ctx.db, workspace.id);
    }),

  /**
   * Get virtual tasks (Master occurrences merged with DB instances) for a date range.
   */
  getVirtualTasks: protectedProcedure
    .meta({
      openapi: {
        summary: "Get virtual task occurrences for a date range",
        method: "GET",
        path: "/workspaces/{workspacePublicId}/virtual-tasks",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(
      z.object({
        workspacePublicId: z.string().min(12),
        /** ISO date string "YYYY-MM-DD" */
        from: z.string().date(),
        /** ISO date string "YYYY-MM-DD" */
        to: z.string().date(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const workspace = await workspaceRepo.getByPublicId(
        ctx.db,
        input.workspacePublicId,
      );
      if (!workspace)
        throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

      await assertUserInWorkspace(ctx.db, userId, workspace.id);

      const fromDate = new Date(input.from);
      const toDate = new Date(input.to);

      if (fromDate > toDate)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "`from` must be before or equal to `to`",
        });

      // 1. Load all active masters
      const masters = await taskMasterRepo.getActiveByWorkspaceId(
        ctx.db,
        workspace.id,
      );

      if (masters.length === 0) return [];

      // 2. Load all materialized instances in the range
      const masterIds = masters.map((m) => m.id);
      const instances = await taskInstanceRepo.getByWorkspaceInRange(
        ctx.db,
        masterIds,
        fromDate,
        toDate,
      );

      // 3. Attach instances to their master before passing to scheduler
      const mastersWithInstances = masters.map((m) => ({
        ...m,
        instances: instances
          .filter((inst) => inst.masterId === m.id)
          .map((inst) => ({
            ...inst,
            targetDate: inst.targetDate instanceof Date
              ? inst.targetDate
              : new Date(inst.targetDate),
          })),
      }));

      // 4. Expand virtual tasks and merge with materialized instances
      return expandVirtualTasks(mastersWithInstances, fromDate, toDate);
    }),

  /**
   * Materialize (upsert) a task instance for a specific master + date.
   */
  materializeInstance: protectedProcedure
    .meta({
      openapi: {
        summary: "Materialize a task instance",
        method: "POST",
        path: "/task-masters/{taskMasterPublicId}/instances",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(
      z.object({
        taskMasterPublicId: z.string().min(12),
        targetDate: z.string().date(),
        status: z
          .enum(["pending", "in_progress", "done", "skipped"])
          .optional(),
        cardPublicId: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      const master = await taskMasterRepo.getByPublicId(
        ctx.db,
        input.taskMasterPublicId,
      );
      if (!master)
        throw new TRPCError({ code: "NOT_FOUND", message: "Task master not found" });

      await assertUserInWorkspace(ctx.db, userId, master.workspace.id);

      return taskInstanceRepo.upsert(ctx.db, {
        masterId: master.id,
        targetDate: new Date(input.targetDate),
        status: input.status,
        createdBy: userId,
      });
    }),

  /**
   * Update the status of a task instance.
   */
  updateInstanceStatus: protectedProcedure
    .meta({
      openapi: {
        summary: "Update instance status",
        method: "PATCH",
        path: "/task-instances/{instancePublicId}/status",
        tags: ["Task Masters"],
        protect: true,
      },
    })
    .input(
      z.object({
        instancePublicId: z.string().min(12),
        status: z.enum(["pending", "in_progress", "done", "skipped"]),
        actualStartAt: z.string().datetime().optional(),
        actualEndAt: z.string().datetime().optional(),
        note: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });

      return taskInstanceRepo.updateStatus(
        ctx.db,
        input.instancePublicId,
        input.status,
        {
          actualStartAt: input.actualStartAt
            ? new Date(input.actualStartAt)
            : undefined,
          actualEndAt: input.actualEndAt
            ? new Date(input.actualEndAt)
            : undefined,
          note: input.note,
        },
      );
    }),
});
