import { z } from "zod";

import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import { statusTypeEnum } from "@kan/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";

const statusTypeEnumSchema = z.enum(statusTypeEnum.enumValues);

export const taskInstanceRouter = createTRPCRouter({
  create: protectedProcedure
    .meta({
      openapi: {
        summary: "Create a task instance",
        method: "POST",
        path: "/task-instance",
        description: "Create a task instance",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(
      z.object({
        userId: z.string(),
        taskMasterId: z.string(),
        targetDate: z.date(),
        actualDate: z.date(),
        status: statusTypeEnumSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, taskMasterId, targetDate, actualDate, status } = input;

      return taskInstanceRepo.create(ctx.db, {
        userId,
        taskMasterId,
        targetDate,
        actualDate,
        status,
      });
    }),
  getVirtual: protectedProcedure
    .meta({
      openapi: {
        summary: "Get virtual task instances",
        method: "GET",
        path: "/task-instance-virtual",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(
      z.object({
        taskMasterId: z.string(),
        from: z.date(),
        to: z.date(),
      }),
    )
    .output(
      z.custom<
        Awaited<
          ReturnType<typeof taskInstanceRepo.generateVirtualTaskInstances>
        >
      >(),
    )
    .query(async ({ ctx, input }) => {
      const taskMaster = await ctx.db.query.taskMasters.findFirst({
        where: (t, { eq }) => eq(t.id, input.taskMasterId),
        with: { frequence: true },
      });

      if (!taskMaster?.frequence) {
        throw new Error("TaskMaster not found");
      }

      if (!taskMaster.frequence.rruleString || !taskMaster.frequence.dtStart) {
        throw new Error("Frequence not found");
      }

      return taskInstanceRepo.generateVirtualTaskInstances({
        userId: taskMaster.targetUser,
        taskMasterId: taskMaster.id,
        rruleString: taskMaster.frequence.rruleString,
        startDate: taskMaster.startDate,
        from: input.from,
        to: input.to,
      });
    }),
<<<<<<< HEAD
});
=======
    update: protectedProcedure
    .meta({
        openapi: {
            summary: "Update a task instance",
            method: "PUT",
            path: "/task-instance",
            description: "Update a task instance",
            tags: ["taskInstance"],
            protect: true,
        }
    })
    .input(
        z.object({
            id: z.string(),
            userId: z.string(),
            taskMasterId: z.string(),
            targetDate: z.date(),
            actualDate: z.date(),
            status: statusTypeEnumSchema,
        })
    )
    .mutation(async ({ctx, input}) => {
        const userId = ctx.user?.id;
        
        if (!userId) {
            throw new TRPCError({
                message: `User not authenticated`,
                code: "UNAUTHORIZED",
            });
        }

        const {id, taskMasterId, targetDate, actualDate, status} = input;

        const oldTaskInstance = await ctx.db.query.taskInstances.findFirst({
            where: (t, { eq }) => eq(t.id, id),
        });

        if (!oldTaskInstance) {
            throw new TRPCError({
                message: `Task instance not found`,
                code: "NOT_FOUND",
            });
        }

        const taskMaster = await ctx.db.query.taskMasters.findFirst({
            where: (t, { eq }) => eq(t.id, taskMasterId),
        });

        if (!taskMaster) {
            throw new TRPCError({
                message: `Task master not found`,
                code: "NOT_FOUND",
            });
        }

        if (taskMaster.targetUser !== userId || taskMaster.createdBy !== userId) {
            throw new TRPCError({
                message: `User not authorized to update this task instance`,
                code: "UNAUTHORIZED",
            });
        }

        const newTaskInstance = await taskInstanceRepo.update(ctx.db, {
            id,
            userId,
            taskMasterId,
            targetDate,
            actualDate,
            status: status || oldTaskInstance.status,
        });

        if (!newTaskInstance) {
            throw new TRPCError({
                message: `Failed to update task instance`,
                code: "INTERNAL_SERVER_ERROR",
            });
        }

        if (oldTaskInstance.status !== newTaskInstance.status) {
            const cardActivitesInsert = [{
                type: "status_changed" as const,
                taskInstanceId: oldTaskInstance.id,
                createdBy: userId,
                oldValue: oldTaskInstance.status,
                newValue: newTaskInstance.status,
            }];

            await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, cardActivitesInsert);
        }

        if (oldTaskInstance.targetDate !== newTaskInstance.targetDate) {
            const cardActivitesInsert = [{
                type: "deadline_changed" as const,
                taskInstanceId: oldTaskInstance.id,
                createdBy: userId,
                oldValue: oldTaskInstance.targetDate?.toISOString(),
                newValue: newTaskInstance.targetDate?.toISOString(),
            }];

            await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, cardActivitesInsert);
        }

        return newTaskInstance;
    }),
    delete: protectedProcedure
    .meta({
        openapi: {
            summary: "Delete a task instance",
            method: "DELETE",
            path: "/task-instance",
            description: "Delete a task instance",
            tags: ["taskInstance"],
            protect: true,
        }
    })
    .input(
        z.object({
            id: z.string(),
            taskMasterId: z.string(),
            type: z.enum(["single", "all"]), 
        })
    )
    .mutation(async ({ctx, input}) => {
        const userId = ctx.user?.id;
        
        if (!userId) {
            throw new TRPCError({
                message: `User not authenticated`,
                code: "UNAUTHORIZED",
            });
        }

        const {id, taskMasterId, type} = input;

        if (type === 'single') {
            const newTaskInstance = await taskInstanceRepo.deleteSingle(ctx.db, {
                id,
                userId,
            });

            if (!newTaskInstance) {
                throw new TRPCError({
                    message: `Failed to delete task instance`,
                    code: "INTERNAL_SERVER_ERROR",
                });
            }

            return newTaskInstance;
        }
        
        if (type === 'all') {
            const newTaskInstance = await taskInstanceRepo.deleteAll(ctx.db, {
                taskMasterId,
                userId,
            });

            if (!newTaskInstance) {
                throw new TRPCError({
                    message: `Failed to delete task instance`,
                    code: "INTERNAL_SERVER_ERROR",
                });
            }

            const taskMaster = await taskMasterRepo.softDelete(ctx.db, {
                id: taskMasterId,
                userId,
            });

            if (!taskMaster) {
                throw new TRPCError({
                    message: `Failed to delete task master`,
                    code: "INTERNAL_SERVER_ERROR",
                });
            }

            return {newTaskInstance, taskMaster};
        }

        throw new TRPCError({
            message: `Invalid type`,
            code: "BAD_REQUEST",
        });
    })
})
>>>>>>> d8e9006efb240249ed3a3c7347bdc94eaf1c91bf
