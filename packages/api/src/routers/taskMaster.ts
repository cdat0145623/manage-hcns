import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import {
  calendarDateKeyInAppZone,
  parseCalendarDayInZone,
} from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { canUpdateTaskMaster } from "../utils/task-master-authorization";

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
        effectiveFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .refine((value) => {
            const parsed = parseCalendarDayInZone(value);
            return (
              !Number.isNaN(parsed.getTime()) &&
              calendarDateKeyInAppZone(parsed) === value
            );
          }, "effectiveFrom must be a valid calendar date"),
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
        effectiveFrom,
      } = input;

      const [currentUser, existingTaskMaster] = await Promise.all([
        userRepo.getById(ctx.db, userId),
        ctx.db.query.taskMasters.findFirst({
          where: (taskMaster, { eq }) => eq(taskMaster.id, id),
          columns: { createdBy: true, targetUser: true },
        }),
      ]);

      if (!currentUser) {
        throw new TRPCError({ message: "User not found", code: "NOT_FOUND" });
      }
      if (!existingTaskMaster) {
        throw new TRPCError({
          message: "Task master not found",
          code: "NOT_FOUND",
        });
      }
      if (
        !canUpdateTaskMaster({
          actorId: userId,
          actorRole: currentUser.role,
          createdBy: existingTaskMaster.createdBy,
          targetUser: existingTaskMaster.targetUser,
        })
      ) {
        throw new TRPCError({
          message: "User not authorized to update this task series",
          code: "FORBIDDEN",
        });
      }

      try {
        return await taskMasterRepo.update(ctx.db, {
          id,
          name,
          description,
          startDate,
          endDate,
          selectedUserId,
          rruleString,
          effectiveFrom,
          userId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("TASK_MASTER_FORBIDDEN")) {
          throw new TRPCError({
            message: "User not authorized to update this task series",
            code: "FORBIDDEN",
            cause: error,
          });
        }
        if (
          message.includes("TASK_MASTER_SCHEDULE_CONFLICT") ||
          message.includes("unique constraint") ||
          message.includes("duplicate key")
        ) {
          throw new TRPCError({
            message:
              "Lịch mới xung đột với một công việc đã tồn tại. Không có thay đổi nào được lưu.",
            code: "CONFLICT",
            cause: error,
          });
        }
        throw error;
      }
    }),
});
