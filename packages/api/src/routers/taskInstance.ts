import { TRPCError } from "@trpc/server";
import { z } from "zod";

import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardCommentRepo from "@kan/db/repository/cardComment.repo";
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import { statusTypeEnum } from "@kan/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  trackTaskInstanceRewardViolations,
  markTaskInstanceConfigWaitingEvaluation,
  revertTaskInstanceConfigToApproved,
} from "../utils/rewardViolation";

import pkg from "rrule";
const { RRule } = pkg;

const statusTypeEnumSchema = z.enum(statusTypeEnum.enumValues);

import type { Language } from 'rrule/dist/esm/nlp/i18n'
import { Weekday } from 'rrule'

// ---- 1. Định nghĩa ngôn ngữ tiếng Việt ----
const VIETNAMESE: Language = {
  dayNames: [
    'Chủ Nhật',
    'Thứ Hai',
    'Thứ Ba',
    'Thứ Tư',
    'Thứ Năm',
    'Thứ Sáu',
    'Thứ Bảy',
  ],
  monthNames: [
    'tháng 1',
    'tháng 2',
    'tháng 3',
    'tháng 4',
    'tháng 5',
    'tháng 6',
    'tháng 7',
    'tháng 8',
    'tháng 9',
    'tháng 10',
    'tháng 11',
    'tháng 12',
  ],
  tokens: {
    SKIP: /^(thứ|ngày|vào|lúc)\b/i,
    number: /^[1-9][0-9]*/,
    numberAsText: /^(một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười)/i,
    every: /^Hằng/i,
    day: /^ngày/i,
    days: /^ngày/i,
    week: /^tuần/i,
    weeks: /^tuần/i,
    month: /^tháng/i,
    months: /^tháng/i,
    year: /^năm/i,
    years: /^năm/i,
    on: /^vào/i,
    in: /^trong/i,
    'on the': /^vào ngày/i,
    for: /^trong/i,
    and: /^và/i,
    or: /^hoặc/i,
    at: /^lúc/i,
    last: /^cuối/i,
    '(~ approximate)': /^(~)/,
    until: /^đến/i,
    time: /^(lần)/i,
    times: /^(lần)/i,
  },
}

// ---- 2. Hàm gettext dịch các token tiếng Anh sang tiếng Việt ----
const vietnameseGettext = (id: string | number | Weekday): string => {
  const key = id.toString()
  
  const translations: Record<string, string> = {
    every: 'Hằng',
    day: 'ngày',
    days: 'ngày',
    week: 'tuần',
    weeks: 'tuần',
    month: 'tháng',
    months: 'tháng',
    year: 'năm',
    years: 'năm',
    on: 'vào',
    in: 'trong',
    'on the': 'vào ngày',
    for: 'trong',
    and: 'và',
    or: 'hoặc',
    at: 'lúc',
    last: 'cuối',
    '(~ approximate)': '(~)',
    until: 'đến',
    time: 'lần',
    times: 'lần',
    Monday: 'Thứ Hai',
    Tuesday: 'Thứ Ba',
    Wednesday: 'Thứ Tư',
    Thursday: 'Thứ Năm',
    Friday: 'Thứ Sáu',
    Saturday: 'Thứ Bảy',
    Sunday: 'Chủ Nhật',
    January: 'tháng 1',
    February: 'tháng 2',
    March: 'tháng 3',
    April: 'tháng 4',
    May: 'tháng 5',
    June: 'tháng 6',
    July: 'tháng 7',
    August: 'tháng 8',
    September: 'tháng 9',
    October: 'tháng 10',
    November: 'tháng 11',
    December: 'tháng 12',
    '1st': 'thứ 1',
    '2nd': 'thứ 2',
    '3rd': 'thứ 3',
    '4th': 'thứ 4',
    '5th': 'thứ 5',
  }

  return translations[key] ?? key
}

export const taskInstanceRouter = createTRPCRouter({
  byId: protectedProcedure
    .meta({
      openapi: {
        summary: "Get task instance by ID",
        method: "GET",
        path: "/task-instance/{id}",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          message: `User not authenticated`,
          code: "UNAUTHORIZED",
        });
      }

      const taskInstance = await ctx.db.query.taskInstances.findFirst({
        where: (t, { eq }) => eq(t.id, input.id),
        with: {
          checklists: {
            with: { 
              items: {
                where: (t, { isNull }) => isNull(t.deletedAt),
              }
             },
            where: (t, { isNull }) => isNull(t.deletedAt),
          },
        },
      });

      if (!taskInstance) {
        throw new TRPCError({
          message: "Task instance not found",
          code: "NOT_FOUND",
        });
      }

      return taskInstance;
    }),
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
        taskMasterId: z.string(),
        targetDate: z.date(),
        actualDate: z.date(),
        status: statusTypeEnumSchema,
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

      const { taskMasterId, targetDate, actualDate, status } = input;

      const taskMaster = await ctx.db.query.taskMasters.findFirst({
        where: (t, { eq }) => eq(t.id, taskMasterId),
      });

      if (!taskMaster) {
        throw new TRPCError({
          message: `Task master not found`,
          code: "NOT_FOUND",
        });
      }

      const instanceEndDate = new Date(targetDate);
      instanceEndDate.setHours(taskMaster.endDate.getHours());
      instanceEndDate.setMinutes(taskMaster.endDate.getMinutes());
      instanceEndDate.setSeconds(taskMaster.endDate.getSeconds());
      instanceEndDate.setMilliseconds(taskMaster.endDate.getMilliseconds());

      const newTaskInstance = await taskInstanceRepo.create(ctx.db, {
        userId,
        taskMasterId,
        name: taskMaster.name!,
        description: taskMaster.description!,
        targetDate,
        actualDate,
        endDate: instanceEndDate,
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
        where: (t, { and, eq }) =>
          and(
            ...(input.targetUser ? [eq(t.targetUser, input.targetUser)] : []),
            ...(input.createdBy ? [eq(t.createdBy, input.createdBy)] : []),
            eq(t.isDeleted, false),
          ),
        with: { frequence: true, assignee: true },
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

            const normalizedRrule = taskMaster.frequence.rruleString.replace(/\\n/g, "\n");
            const rule = RRule.fromString(normalizedRrule);
            const ruleText = rule.toText(vietnameseGettext, VIETNAMESE)

            const from = input.from;
            const to = input.to;

            const virtualTaskInstances =
              await taskInstanceRepo.generateVirtualTaskInstances({
                userId: taskMaster.targetUser,
                taskMasterId: taskMaster.id,
                rruleString: taskMaster.frequence.rruleString,
                startDate: taskMaster.startDate,
                masterEndDate: taskMaster.endDate,
                from,
                to,
              });

            const existingTaskInstances =
              await ctx.db.query.taskInstances.findMany({
                where: (t, { and, eq }) =>
                  and(
                    eq(t.taskMasterId, taskMaster.id),
                    eq(t.isDeleted, false),
                  ),
                with: {
                  checklists: {
                    with: { items: {
                      where: (t, { isNull }) => isNull(t.deletedAt),
                    } },
                    where: (t, { isNull }) => isNull(t.deletedAt),
                  },
                },
              });

            const existingTaskInstanceMap = new Map(
              existingTaskInstances.map((taskInstance) => [
                taskInstance.targetDate!.toISOString(),
                taskInstance,
              ]),
            );

            const newVirtualTaskInstances = virtualTaskInstances.map(
              (virtualInstance) => {
                const existing = existingTaskInstanceMap.get(
                  virtualInstance.targetDate!.toISOString(),
                );

                const taskMasterInfo = {
                  name: taskMaster.name,
                  description: taskMaster.description,
                  selectedUserId: taskMaster.targetUser,
                  startDate: taskMaster.startDate,
                  endDate: taskMaster.endDate,
                  createdBy: taskMaster.createdBy,
                  rruleStringToText: ruleText
                };

                if (existing) {
                  return {
                    ...existing,
                    taskMaster: taskMasterInfo,
                    assignee: taskMaster.assignee,
                  };
                }

                return {
                  ...virtualInstance,
                  taskMaster: taskMasterInfo,
                  assignee: taskMaster.assignee,
                };
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
      z.object({
        id: z.string(),
        taskMasterId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        targetDate: z.date().optional(),
        actualDate: z.date().optional(),
        status: statusTypeEnumSchema,
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
        taskMasterId,
        name,
        description,
        targetDate,
        actualDate,
        status,
      } = input;

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

      if (taskMaster.targetUser !== userId && taskMaster.createdBy !== userId) {
        throw new TRPCError({
          message: `User not authorized to update this task instance`,
          code: "UNAUTHORIZED",
        });
      }

      const instanceEndDate = new Date(targetDate ?? oldTaskInstance.targetDate!);
      instanceEndDate.setHours(taskMaster.endDate.getHours());
      instanceEndDate.setMinutes(taskMaster.endDate.getMinutes());
      instanceEndDate.setSeconds(taskMaster.endDate.getSeconds());
      instanceEndDate.setMilliseconds(taskMaster.endDate.getMilliseconds());

      const newTaskInstance = await taskInstanceRepo.update(ctx.db, {
        id,
        userId,
        taskMasterId,
        name,
        description,
        targetDate,
        actualDate,
        endDate: instanceEndDate,
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

      // ---- Reward Triggers ----
      // 1. Violation Check (End Date, Target Date, or Assignee changed)
      if (
        oldTaskInstance.endDate?.getTime() !== newTaskInstance.endDate?.getTime() ||
        oldTaskInstance.targetDate?.getTime() !== newTaskInstance.targetDate?.getTime() ||
        oldTaskInstance.userId !== newTaskInstance.userId
      ) {
        await trackTaskInstanceRewardViolations({
          db: ctx.db,
          taskInstanceId: id,
          newDueDate: newTaskInstance.endDate,
          newStartDate: newTaskInstance.targetDate,
          newTargetUser: newTaskInstance.userId,
        });
      }

      // 2. Evaluation Status Transition
      if (oldTaskInstance.status !== newTaskInstance.status) {
        if (newTaskInstance.status === "done") {
          await markTaskInstanceConfigWaitingEvaluation({
            db: ctx.db,
            taskInstanceId: id,
          });
        } else if (oldTaskInstance.status === "done") {
          await revertTaskInstanceConfigToApproved({
            db: ctx.db,
            taskInstanceId: id,
          });
        }
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

  addComment: protectedProcedure
    .meta({
      openapi: {
        summary: "Add a comment to a task instance",
        method: "POST",
        path: "/task-instance/{id}/comments",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
        comment: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const taskInstance = await ctx.db.query.taskInstances.findFirst({
        where: (t, { eq }) => eq(t.id, input.id),
      });

      if (!taskInstance) throw new TRPCError({ code: "NOT_FOUND" });

      const newComment = await cardCommentRepo.create(ctx.db, {
        comment: input.comment,
        createdBy: userId,
        taskInstanceId: taskInstance.id,
      });

      if (!newComment?.id)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, [
        {
          type: "updated_comment_added" as const,
          taskInstanceId: taskInstance.id,
          commentId: newComment.id,
          toComment: newComment.comment,
          createdBy: userId,
        },
      ]);

      return newComment;
    }),

  getActivities: protectedProcedure
    .meta({
      openapi: {
        summary: "Get paginated task instance activities",
        method: "GET",
        path: "/task-instance/{id}/activities",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
        limit: z.number().min(1).max(100).optional().default(10),
        cursor: z.string().datetime().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      return await cardActivityRepo.getPaginatedActivitiesForTaskInstance(
        ctx.db,
        input.id,
        {
          limit: input.limit,
          cursor: input.cursor ? new Date(input.cursor) : undefined,
        },
      );
    }),

  deleteComment: protectedProcedure
    .meta({
      openapi: {
        summary: "Delete a comment from a task instance",
        method: "DELETE",
        path: "/task-instance/{id}/comments/{commentPublicId}",
        tags: ["taskInstance"],
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
        commentPublicId: z.string().min(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const existingComment = await cardCommentRepo.getByPublicId(
        ctx.db,
        input.commentPublicId,
      );
      if (!existingComment) throw new TRPCError({ code: "NOT_FOUND" });

      if (existingComment.createdBy !== userId)
        throw new TRPCError({ code: "UNAUTHORIZED" });

      const deletedComment = await cardCommentRepo.softDelete(ctx.db, {
        commentId: existingComment.id,
        deletedAt: new Date(),
        deletedBy: userId,
      });

      if (!deletedComment)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, [
        {
          type: "updated_comment_deleted" as const,
          taskInstanceId: input.id,
          commentId: existingComment.id,
          createdBy: userId,
        },
      ]);

      return deletedComment;
    }),

  updateComment: protectedProcedure
    .meta({
      openapi: {
        summary: "Update a comment from a task instance",
        method: "PUT",
        path: "/task-instance/{id}/comments/{commentPublicId}",
        tags: ["taskInstance"],
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
        commentPublicId: z.string().min(12),
        comment: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

      const existingComment = await cardCommentRepo.getByPublicId(
        ctx.db,
        input.commentPublicId,
      );
      if (!existingComment) throw new TRPCError({ code: "NOT_FOUND" });

      if (existingComment.createdBy !== userId)
        throw new TRPCError({ code: "UNAUTHORIZED" });

      const updatedComment = await cardCommentRepo.update(ctx.db, {
        id: existingComment.id,
        comment: input.comment,
      });

      if (!updatedComment)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await cardActivityRepo.bulkCreateForTaskInstance(ctx.db, [
        {
          type: "updated_comment_updated" as const,
          taskInstanceId: input.id,
          commentId: existingComment.id,
          createdBy: userId,
        },
      ]);

      return updatedComment;
    }),
});
