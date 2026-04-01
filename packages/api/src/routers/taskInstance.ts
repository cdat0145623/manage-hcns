/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
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

      const newTaskInstance = await taskInstanceRepo.create(ctx.db, {
        userId,
        taskMasterId,
        targetDate,
        actualDate,
        status,
      });

      if (!newTaskInstance) {
        throw new TRPCError({
          message: `Failed to create task instance`,
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      return newTaskInstance;
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
        // taskMasterId: z.string(),
        targetUser: z.string().optional(),
        createdBy: z.string().optional(),
        from: z.coerce.date(),
        to: z.coerce.date(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // const taskMaster = await ctx.db.query.taskMasters.findFirst({
      //     where: (t, { eq }) => eq(t.id, input.taskMasterId),
      //     with: { frequence: true },
      // });

<<<<<<< HEAD
      // const from = input.from.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
      // const to = input.to.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
=======
        // const from = input.from.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
        // const to = input.to.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' });
        const userId = ctx.user?.id;

        if (!userId) {
            throw new TRPCError({
                message: `User not authenticated`,
                code: "UNAUTHORIZED",
            });
        }
        
        const taskMasters = await ctx.db.query.taskMasters.findMany({
            where: (t, { and, lt, gte, eq }) => 
                and(
                    lt(t.startDate, input.to), 
                    gte(t.endDate, input.from),
                    ...(input.targetUser ? [eq(t.targetUser, input.targetUser)] : []),
                    ...(input.createdBy ? [eq(t.createdBy, input.createdBy)] : []),
                    eq(t.isDeleted, false),
                ),
            with: { frequence: true },
>>>>>>> e77a7e028a51ce657f32e2ef28e353b7899ff620
        });
      }

      const taskMasters = await ctx.db.query.taskMasters.findMany({
        where: (t, { and, lt, gte, eq }) =>
          and(
            lt(t.startDate, input.to),
            gte(t.endDate, input.from),
            ...(input.targetUser ? [eq(t.targetUser, input.targetUser)] : []),
            ...(input.createdBy ? [eq(t.createdBy, input.createdBy)] : []),
            eq(t.isDeleted, false),
          ),
        with: { frequence: true },
      });

      const results = await Promise.all(
        taskMasters.map(async (taskMaster) => {
          try {
            if (
              !taskMaster.frequence?.rruleString ||
              !taskMaster.frequence?.dtStart
            ) {
              return [];
            }

            const from =
              input.from > taskMaster.startDate
                ? input.from
                : taskMaster.startDate;
            const to =
              input.to > taskMaster.endDate ? taskMaster.endDate : input.to;

            const virtualTaskInstances =
              await taskInstanceRepo.generateVirtualTaskInstances({
                userId: taskMaster.targetUser,
                taskMasterId: taskMaster.id,
                rruleString: taskMaster.frequence.rruleString,
                startDate: taskMaster.startDate,
                from,
                to,
              });

            const existingTaskInstances =
              await ctx.db.query.taskInstances.findMany({
                where: (t, { and, lt, gte, eq }) =>
                  and(
                    lt(t.targetDate, to),
                    gte(t.targetDate, from),
                    eq(t.taskMasterId, taskMaster.id),
                    eq(t.isDeleted, false),
                  ),
              });

<<<<<<< HEAD
            const existingTaskInstanceMap = new Map(
              existingTaskInstances.map((taskInstance) => [
                taskInstance.targetDate!.toISOString(),
                taskInstance,
              ]),
            );
=======
                    const newVirtualTaskInstances = virtualTaskInstances.map((virtualInstance) => {
                        const existing = existingTaskInstanceMap.get(virtualInstance.targetDate!.toISOString());
                        return existing ?? {
                            ...virtualInstance,
                            selectedUserId: taskMaster.targetUser,
                            startDate: taskMaster.startDate,
                            endDate: taskMaster.endDate,
                        };
                    });
>>>>>>> e77a7e028a51ce657f32e2ef28e353b7899ff620

            const newVirtualTaskInstances = virtualTaskInstances.map(
              (virtualInstance) => {
                const existing = existingTaskInstanceMap.get(
                  virtualInstance.targetDate!.toISOString(),
                );
                return (
                  existing ?? {
                    ...virtualInstance,
                    selectedUserId: taskMaster.targetUser,
                    startDate: taskMaster.startDate,
                    endDate: taskMaster.endDate,
                  }
                );
              },
            );

            return newVirtualTaskInstances;
          } catch (err) {
            return [];
          }
        }),
      );

      return results.flat();
    }),
  update: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a task instance",
        method: "PUT",
        path: "/task-instance",
        description: "Update a task instance",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(
<<<<<<< HEAD
      z.object({
        id: z.string(),
        taskMasterId: z.string(),
        targetDate: z.date().optional(),
        actualDate: z.date().optional(),
        status: statusTypeEnumSchema,
      }),
=======
        z.object({
            id: z.string(),
            taskMasterId: z.string(),
            targetDate: z.date().optional(),
            actualDate: z.date().optional(),
            status: statusTypeEnumSchema,
        })
>>>>>>> e77a7e028a51ce657f32e2ef28e353b7899ff620
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });
      }

      const { id, taskMasterId, targetDate, actualDate, status } = input;

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

<<<<<<< HEAD
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
        status: status,
      });

      if (!newTaskInstance) {
        throw new TRPCError({
          message: `Failed to update task instance`,
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      if (oldTaskInstance.status !== newTaskInstance.status) {
        const cardActivitesInsert = [
          {
            type: "status_changed" as const,
            taskInstanceId: oldTaskInstance.id,
            createdBy: userId,
            oldValue: oldTaskInstance.status,
            newValue: newTaskInstance.status,
          },
        ];

        await cardActivityRepo.bulkCreateForTaskInstance(
          ctx.db,
          cardActivitesInsert,
        );
      }

      if (oldTaskInstance.targetDate !== newTaskInstance.targetDate) {
        const cardActivitesInsert = [
          {
            type: "deadline_changed" as const,
            taskInstanceId: oldTaskInstance.id,
            createdBy: userId,
            oldValue: oldTaskInstance.targetDate?.toISOString(),
            newValue: newTaskInstance.targetDate?.toISOString(),
          },
        ];

        await cardActivityRepo.bulkCreateForTaskInstance(
          ctx.db,
          cardActivitesInsert,
        );
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
      },
    })
    .input(
      z.object({
        id: z.string(),
        taskMasterId: z.string(),
        type: z.enum(["single", "all"]),
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

      const { id, taskMasterId, type } = input;

      if (type === "single") {
        const newTaskInstance = await taskInstanceRepo.deleteSingle(ctx.db, {
          id,
          userId,
=======
        const newTaskInstance = await taskInstanceRepo.update(ctx.db, {
            id,
            userId,
            taskMasterId,
            targetDate,
            actualDate,
            status: status,
>>>>>>> e77a7e028a51ce657f32e2ef28e353b7899ff620
        });

        if (!newTaskInstance) {
          throw new TRPCError({
            message: `Failed to delete task instance`,
            code: "INTERNAL_SERVER_ERROR",
          });
        }

        return newTaskInstance;
      }

      if (type === "all") {
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

        return { newTaskInstance, taskMaster };
      }

      throw new TRPCError({
        message: `Invalid type`,
        code: "BAD_REQUEST",
      });
    }),
});
