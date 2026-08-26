import type { Weekday } from "rrule";
import type { Language } from "rrule/dist/esm/nlp/i18n";
import { TRPCError } from "@trpc/server";
import * as rrule from "rrule";
import { z } from "zod";

import type { PenaltySnapshot } from "@kan/db/repository/taskPenaltyPolicy.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as cardCommentRepo from "@kan/db/repository/cardComment.repo";
import * as rewardRepo from "@kan/db/repository/reward.repo";
import * as taskInstanceRepo from "@kan/db/repository/taskInstance.repo";
import * as taskInstanceStatusRepo from "@kan/db/repository/taskInstanceStatus.repo";
import * as taskMasterRepo from "@kan/db/repository/taskMaster.repo";
import { loadPenaltySnapshotsForMasters } from "@kan/db/repository/taskPenaltyPolicy.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import { statusTypeEnum } from "@kan/db/schema";
import { applyMasterWallTimeToAnchorDay } from "@kan/shared/utils";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import {
  markTaskInstanceConfigWaitingEvaluation,
  revertTaskInstanceConfigToApproved,
  trackTaskInstanceRewardViolations,
} from "../utils/rewardViolation";
import { getTaskInstanceUpdateAuthorization } from "../utils/task-instance-authorization";
import { mergeStoredAndVirtualTaskInstances } from "../utils/task-instance-calendar";
import {
  resolveTaskInstanceEndDate,
  resolveTaskInstanceStatusTransition,
} from "../utils/taskInstanceStatusTransition";

const { RRule } = rrule;

const statusTypeEnumSchema = z.enum(statusTypeEnum.enumValues);

// ---- 1. Định nghĩa ngôn ngữ tiếng Việt ----
const VIETNAMESE: Language = {
  dayNames: [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ],
  monthNames: [
    "tháng 1",
    "tháng 2",
    "tháng 3",
    "tháng 4",
    "tháng 5",
    "tháng 6",
    "tháng 7",
    "tháng 8",
    "tháng 9",
    "tháng 10",
    "tháng 11",
    "tháng 12",
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
    "on the": /^vào ngày/i,
    for: /^trong/i,
    and: /^và/i,
    or: /^hoặc/i,
    at: /^lúc/i,
    last: /^cuối/i,
    "(~ approximate)": /^(~)/,
    until: /^đến/i,
    time: /^(lần)/i,
    times: /^(lần)/i,
  },
};

// ---- 2. Hàm gettext dịch các token tiếng Anh sang tiếng Việt ----
const vietnameseGettext = (id: string | number | Weekday): string => {
  const key = id.toString();

  const translations: Record<string, string> = {
    every: "Hằng",
    day: "ngày",
    days: "ngày",
    week: "tuần",
    weeks: "tuần",
    month: "tháng",
    months: "tháng",
    year: "năm",
    years: "năm",
    on: "vào",
    in: "trong",
    "on the": "vào ngày",
    for: "trong",
    and: "và",
    or: "hoặc",
    at: "lúc",
    last: "cuối",
    "(~ approximate)": "(~)",
    until: "đến",
    time: "lần",
    times: "lần",
    Monday: "Thứ Hai",
    Tuesday: "Thứ Ba",
    Wednesday: "Thứ Tư",
    Thursday: "Thứ Năm",
    Friday: "Thứ Sáu",
    Saturday: "Thứ Bảy",
    Sunday: "Chủ Nhật",
    January: "tháng 1",
    February: "tháng 2",
    March: "tháng 3",
    April: "tháng 4",
    May: "tháng 5",
    June: "tháng 6",
    July: "tháng 7",
    August: "tháng 8",
    September: "tháng 9",
    October: "tháng 10",
    November: "tháng 11",
    December: "tháng 12",
    "1st": "thứ 1",
    "2nd": "thứ 2",
    "3rd": "thứ 3",
    "4th": "thứ 4",
    "5th": "thứ 5",
  };

  return translations[key] ?? key;
};

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
              },
            },
            where: (t, { isNull }) => isNull(t.deletedAt),
          },
          penaltyAssessment: {
            columns: {
              publicId: true,
              amountVnd: true,
              currency: true,
              source: true,
              policyPublicId: true,
              assessedAt: true,
              status: true,
            },
          },
        },
      });

      if (!taskInstance) {
        throw new TRPCError({
          message: "Task instance not found",
          code: "NOT_FOUND",
        });
      }

      const currentUser = await userRepo.getById(ctx.db, userId);
      const taskMaster = await ctx.db.query.taskMasters.findFirst({
        columns: { createdBy: true },
        where: (table, { eq }) => eq(table.id, taskInstance.taskMasterId),
      });
      const canView =
        currentUser?.role === "ADMIN" ||
        taskInstance.userId === userId ||
        taskMaster?.createdBy === userId;
      if (!canView) {
        throw new TRPCError({
          message: "User not authorized to view this task instance",
          code: "FORBIDDEN",
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

      const { taskMasterId, targetDate, status } = input;

      const taskMaster = await ctx.db.query.taskMasters.findFirst({
        where: (t, { eq }) => eq(t.id, taskMasterId),
      });

      if (!taskMaster) {
        throw new TRPCError({
          message: `Task master not found`,
          code: "NOT_FOUND",
        });
      }

      const instanceEndDate = applyMasterWallTimeToAnchorDay(
        targetDate,
        taskMaster.endDate,
      );

      const newTaskInstance = await taskInstanceRepo.create(ctx.db, {
        userId,
        taskMasterId,
        name: taskMaster.name!,
        description: taskMaster.description!,
        targetDate,
        actualDate: status === "done" ? new Date() : null,
        endDate: instanceEndDate,
        status,
      });

      if (!newTaskInstance) {
        throw new TRPCError({
          message: `Failed to create task instance`,
          code: "INTERNAL_SERVER_ERROR",
        });
      }

      try {
        await rewardRepo.cloneMasterRewardTemplateToInstance(ctx.db, {
          taskMasterId,
          taskInstanceId: newTaskInstance.id,
          createdBy: userId,
        });
      } catch (e) {
        console.error("cloneMasterRewardTemplateToInstance failed:", e);
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

      const storedTaskInstances = await ctx.db.query.taskInstances.findMany({
        where: (t, { and, eq, gte, isNotNull, lte }) =>
          and(
            isNotNull(t.targetDate),
            gte(t.targetDate, input.from),
            lte(t.targetDate, input.to),
            ...(input.targetUser ? [eq(t.userId, input.targetUser)] : []),
          ),
        with: {
          user: true,
          taskMaster: {
            with: { frequence: true },
          },
          checklists: {
            with: {
              items: {
                where: (t, { isNull }) => isNull(t.deletedAt),
              },
            },
            where: (t, { isNull }) => isNull(t.deletedAt),
          },
          penaltyAssessment: {
            columns: {
              publicId: true,
              amountVnd: true,
              currency: true,
              source: true,
              policyPublicId: true,
              assessedAt: true,
              status: true,
            },
          },
        },
      });

      const storedInstances = storedTaskInstances.flatMap((taskInstance) => {
        const taskMaster = taskInstance.taskMaster;
        if (
          !taskInstance.targetDate ||
          !taskInstance.endDate ||
          taskMaster.isDeleted ||
          (input.createdBy && taskMaster.createdBy !== input.createdBy)
        ) {
          return [];
        }

        const rruleString = taskMaster.frequence.rruleString;
        let ruleText = "";
        if (rruleString) {
          try {
            ruleText = RRule.fromString(
              rruleString.replace(/\\n/g, "\n"),
            ).toText(vietnameseGettext, VIETNAMESE);
          } catch {
            ruleText = "";
          }
        }

        return [
          {
            ...taskInstance,
            targetDate: taskInstance.targetDate,
            taskMaster: {
              name: taskMaster.name,
              description: taskMaster.description,
              selectedUserId: taskMaster.targetUser,
              startDate: taskMaster.startDate,
              endDate: taskMaster.endDate,
              createdBy: taskMaster.createdBy,
              priority: taskInstance.penaltyPriority,
              recurrence: "CUSTOM" as const,
              rruleString: rruleString ?? "",
              rruleStringToText: ruleText,
            },
            assignee: taskInstance.user,
            color: null,
            duration: undefined,
            recurrence: "CUSTOM" as const,
            rruleString: rruleString ?? "",
            penalty: {
              priority: taskInstance.penaltyPriority,
              amountVnd: taskInstance.penaltyAmountVnd,
              source: taskInstance.penaltySource,
              policyPublicId: taskInstance.penaltyPolicyPublicId,
              snapshottedAt: taskInstance.penaltySnapshottedAt,
              assessment: taskInstance.penaltyAssessment,
            },
          },
        ];
      });

      const virtualInstances = (
        await Promise.all(
          taskMasters.map(async (taskMaster) => {
            try {
              if (
                !taskMaster.frequence.rruleString ||
                !taskMaster.frequence.dtStart
              ) {
                return [];
              }

              const normalizedRrule = taskMaster.frequence.rruleString.replace(
                /\\n/g,
                "\n",
              );
              const rule = RRule.fromString(normalizedRrule);
              const ruleText = rule.toText(vietnameseGettext, VIETNAMESE);

              const virtualTaskInstances =
                await taskInstanceRepo.generateVirtualTaskInstances({
                  userId: taskMaster.targetUser,
                  taskMasterId: taskMaster.id,
                  rruleString: taskMaster.frequence.rruleString,
                  startDate: taskMaster.startDate,
                  masterEndDate: taskMaster.endDate,
                  from: input.from,
                  to: input.to,
                });

              return virtualTaskInstances.map((virtualInstance) => ({
                ...virtualInstance,
                name: taskMaster.name,
                description: taskMaster.description,
                originalEndDate: virtualInstance.endDate,
                color: null,
                duration: undefined,
                recurrence: "CUSTOM" as const,
                rruleString: taskMaster.frequence.rruleString ?? "",
                checklists: [],
                taskMaster: {
                  name: taskMaster.name,
                  description: taskMaster.description,
                  selectedUserId: taskMaster.targetUser,
                  startDate: taskMaster.startDate,
                  endDate: taskMaster.endDate,
                  createdBy: taskMaster.createdBy,
                  priority: taskMaster.priority,
                  penaltyOverrideAmountVnd:
                    taskMaster.penaltyOverrideAmountVnd,
                  recurrence: "CUSTOM" as const,
                  rruleString: taskMaster.frequence.rruleString ?? "",
                  rruleStringToText: ruleText,
                },
                assignee: taskMaster.assignee,
              }));
            } catch {
              return [];
            }
          }),
        )
      ).flat();

      const virtualSnapshots = new Map<string, PenaltySnapshot | null>();
      const occurrencesByDate = new Map<string, typeof virtualInstances>();
      for (const instance of virtualInstances) {
        const key = instance.targetDate.toISOString();
        const occurrences = occurrencesByDate.get(key) ?? [];
        occurrences.push(instance);
        occurrencesByDate.set(key, occurrences);
      }
      await Promise.all(
        Array.from(occurrencesByDate.entries()).map(
          async ([dateKey, occurrences]) => {
            const mastersById = new Map(
              occurrences.map((occurrence) => [
                occurrence.taskMasterId,
                {
                  id: occurrence.taskMasterId,
                  priority: occurrence.taskMaster.priority,
                  overrideAmountVnd:
                    occurrence.taskMaster.penaltyOverrideAmountVnd,
                },
              ]),
            );
            const snapshots = await loadPenaltySnapshotsForMasters(
              ctx.db,
              Array.from(mastersById.values()),
              new Date(dateKey),
            );
            for (const occurrence of occurrences) {
              virtualSnapshots.set(
                occurrence.id,
                snapshots.get(occurrence.taskMasterId) ?? null,
              );
            }
          },
        ),
      );

      const enrichedVirtualInstances = virtualInstances.map((instance) => {
        const snapshot = virtualSnapshots.get(instance.id) ?? null;
        return {
          ...instance,
          penalty: snapshot
            ? {
                priority: snapshot.priority,
                amountVnd: snapshot.amountVnd,
                policyPublicId: snapshot.policyPublicId,
                source: snapshot.source,
                snapshottedAt: null,
                assessment: null,
              }
            : null,
        };
      });

      return mergeStoredAndVirtualTaskInstances({
        storedInstances,
        virtualInstances: enrichedVirtualInstances,
      });
    }),
  extendMissed: protectedProcedure
    .meta({
      openapi: {
        summary: "Extend and reopen a missed task instance",
        method: "POST",
        path: "/task-instance/{id}/extend-missed",
        description: "Allows an administrator to extend a missed task",
        tags: ["taskInstance"],
        protect: true,
      },
    })
    .input(
      z.object({
        id: z.string().uuid(),
        newEndDate: z.date(),
        reason: z.string().trim().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const currentUser = await userRepo.getById(ctx.db, userId);
      if (!currentUser) {
        throw new TRPCError({
          message: "User not found",
          code: "NOT_FOUND",
        });
      }
      if (currentUser.role !== "ADMIN") {
        throw new TRPCError({
          message: "Only administrators can extend missed tasks",
          code: "FORBIDDEN",
        });
      }

      const now = new Date();
      if (input.newEndDate.getTime() <= now.getTime()) {
        throw new TRPCError({
          message: "The new deadline must be in the future",
          code: "BAD_REQUEST",
        });
      }

      const currentInstance = await ctx.db.query.taskInstances.findFirst({
        where: (table, { eq }) => eq(table.id, input.id),
      });
      if (!currentInstance || currentInstance.isDeleted) {
        throw new TRPCError({
          message: "Task instance not found",
          code: "NOT_FOUND",
        });
      }
      if (currentInstance.status !== "missed") {
        throw new TRPCError({
          message: "Task instance is no longer missed",
          code: "CONFLICT",
        });
      }

      const extensionResult =
        await taskInstanceStatusRepo.extendMissedTaskInstance(ctx.db, {
          taskInstanceId: input.id,
          newEndDate: input.newEndDate,
          reason: input.reason,
          actorUserId: userId,
          now,
        });

      if (!extensionResult) {
        throw new TRPCError({
          message: "Task instance was updated elsewhere",
          code: "CONFLICT",
        });
      }

      await trackTaskInstanceRewardViolations({
        db: ctx.db,
        taskInstanceId: input.id,
        newDueDate: extensionResult.instance.endDate,
      });

      return {
        status: extensionResult.instance.status,
        endDate: extensionResult.instance.endDate,
        actualDate: extensionResult.instance.actualDate,
        extension: {
          publicId: extensionResult.extension.publicId,
          previousEndDate: extensionResult.extension.previousEndDate,
          newEndDate: extensionResult.extension.newEndDate,
          reason: extensionResult.extension.reason,
          extendedAt: extensionResult.extension.createdAt,
        },
      };
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

      const { id, taskMasterId, name, description, targetDate, status } = input;

      const oldTaskInstance = await ctx.db.query.taskInstances.findFirst({
        where: (t, { eq }) => eq(t.id, id),
      });

      if (!oldTaskInstance) {
        throw new TRPCError({
          message: `Task instance not found`,
          code: "NOT_FOUND",
        });
      }

      const currentUser = await userRepo.getById(ctx.db, userId);
      if (!currentUser) {
        throw new TRPCError({
          message: `User not found`,
          code: "NOT_FOUND",
        });
      }

      const taskMaster = await ctx.db.query.taskMasters.findFirst({
        where: (t, { eq }) => eq(t.id, oldTaskInstance.taskMasterId),
      });

      if (!taskMaster) {
        throw new TRPCError({
          message: `Task master not found`,
          code: "NOT_FOUND",
        });
      }

      const authorization = getTaskInstanceUpdateAuthorization({
        actorId: userId,
        actorRole: currentUser.role,
        instanceUserId: oldTaskInstance.userId,
        masterCreatedBy: taskMaster.createdBy,
        instanceTaskMasterId: oldTaskInstance.taskMasterId,
        requestedTaskMasterId: taskMasterId,
      });

      if (authorization === "task-master-mismatch") {
        throw new TRPCError({
          message: `Task master does not match this task instance`,
          code: "BAD_REQUEST",
        });
      }

      if (authorization === "forbidden") {
        throw new TRPCError({
          message: `User not authorized to update this task instance`,
          code: "FORBIDDEN",
        });
      }

      const resolvedTransition = resolveTaskInstanceStatusTransition({
        oldStatus: oldTaskInstance.status,
        requestedStatus: status,
        currentActualDate: oldTaskInstance.actualDate,
        endDate: oldTaskInstance.endDate,
        now: new Date(),
      });

      if (!resolvedTransition) {
        throw new TRPCError({
          message: `This task status transition is not allowed`,
          code: "BAD_REQUEST",
        });
      }

      const storedTargetDate = targetDate ?? oldTaskInstance.targetDate;
      if (!storedTargetDate) {
        throw new TRPCError({
          message: "Task instance start date is required",
          code: "BAD_REQUEST",
        });
      }

      const instanceEndDate = resolveTaskInstanceEndDate({
        storedEndDate: oldTaskInstance.endDate,
        storedTargetDate,
        requestedTargetDate: targetDate,
        masterEndDate: taskMaster.endDate,
      });
      // Giữ nguyên userId gắn với instance (slot / assignee theo unique index),
      // không ghi đè bằng ctx.user — tránh false "assignee_changed" và sai reward.
      const newTaskInstance = await taskInstanceRepo.update(ctx.db, {
        id,
        expectedStatus: oldTaskInstance.status,
        userId: oldTaskInstance.userId,
        taskMasterId,
        name,
        description,
        targetDate,
        actualDate: resolvedTransition.actualDate,
        endDate: instanceEndDate,
        status: resolvedTransition.status,
        actorUserId: userId,
      });

      if (!newTaskInstance) {
        throw new TRPCError({
          message: "Task instance was updated elsewhere",
          code: "CONFLICT",
        });
      }

      // ---- Reward Triggers ----
      // 1. Violation Check (End Date, Target Date, or Assignee changed)
      if (
        oldTaskInstance.endDate?.getTime() !==
          newTaskInstance.endDate?.getTime() ||
        oldTaskInstance.targetDate?.getTime() !==
          newTaskInstance.targetDate?.getTime() ||
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
            dueDate: newTaskInstance.endDate,
            completedAt: newTaskInstance.actualDate ?? new Date(),
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

      const [currentUser, taskInstance] = await Promise.all([
        userRepo.getById(ctx.db, userId),
        ctx.db.query.taskInstances.findFirst({
          columns: { userId: true, taskMasterId: true },
          where: (table, { eq }) => eq(table.id, input.id),
          with: {
            taskMaster: { columns: { createdBy: true } },
          },
        }),
      ]);

      if (!taskInstance) throw new TRPCError({ code: "NOT_FOUND" });
      const canView =
        currentUser?.role === "ADMIN" ||
        taskInstance.userId === userId ||
        taskInstance.taskMaster.createdBy === userId;
      if (!canView) throw new TRPCError({ code: "FORBIDDEN" });

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
