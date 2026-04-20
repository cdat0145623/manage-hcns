import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { dbClient } from "@kan/db/client";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import * as userRepo from "@kan/db/repository/user.repo";
import {
  boards,
  cardRewardConfigs,
  cardRewardDeductions,
  cardRewardFinalizations,
  cardRewardLogs,
  cardRewardSnapshots,
  cards,
  lists,
  rewardTypeEnum,
  taskInstances,
  taskMasters,
} from "@kan/db/schema";
import { REWARD_DEDUCTION_REASON } from "@kan/shared/constants";

import { createTRPCRouter, protectedProcedure } from "../trpc";
import { assertCanEdit } from "../utils/permissions";
import { logConfigAudit } from "../utils/rewardViolation";

const deductionReasonEnum = z.enum([
  REWARD_DEDUCTION_REASON.LATE,
  REWARD_DEDUCTION_REASON.MOVE,
]);

const upsertDeductionSchema = z.object({
  id: z.number().optional(),
  reason: deductionReasonEnum,
  unitType: z.enum(["percent", "vnd"]),
  value: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Giá trị không hợp lệ")
    .refine((v) => parseFloat(v) > 0, "Giá trị khấu trừ phải lớn hơn 0"),
  displayOrder: z.number().int().min(0).default(0),
});

const upsertConfigSchema = z
  .object({
    cardPublicId: z.string().optional(),
    taskInstanceId: z.string().uuid().optional(),
    taskMasterId: z.string().uuid().optional(),
    rewardType: z.enum(rewardTypeEnum.enumValues),
    bonusAmount: z.number().optional(),
    currency: z.string().length(3),
    deductions: z
      .array(upsertDeductionSchema)
      .length(2)
      .refine((rows) => {
        const [a, b] = rows;
        return (
          a != null &&
          b != null &&
          a.reason === REWARD_DEDUCTION_REASON.LATE &&
          b.reason === REWARD_DEDUCTION_REASON.MOVE
        );
      }, "Thứ tự khấu trừ: trễ hạn, sau đó dời deadline."),
  })
  .superRefine((data, ctx) => {
    const sources = [
      data.cardPublicId && String(data.cardPublicId).trim().length > 0
        ? "card"
        : null,
      data.taskInstanceId ? "instance" : null,
      data.taskMasterId ? "master" : null,
    ].filter(Boolean);
    if (sources.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Chỉ được chọn một nguồn: thẻ Kanban, task instance, hoặc task master (mẫu thưởng).",
      });
    }
  });

// Config chỉ được sửa khi đang ở trạng thái cho phép.
const EDITABLE_STATUSES = ["draft", "approved", "rejected"] as const;

function assertEditable(status: string, action = "chỉnh sửa") {
  if (!EDITABLE_STATUSES.includes(status as any)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Không thể ${action} cấu hình ở trạng thái "${status}".`,
    });
  }
}

function assertConfigIsNotMasterTemplate(config: {
  taskMasterId: string | null;
}) {
  if (config.taskMasterId != null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Cấu hình mẫu trên task master không hỗ trợ thao tác duyệt / nghiệm thu.",
    });
  }
}

/** Quyền submit/rút: giống sửa thẻ — card:edit hoặc người tạo thẻ (không khóa theo createdBy của reward). */
async function assertUserCanActOnCardRewardConfig(
  db: dbClient,
  userId: string,
  config: {
    cardId: number | null;
    taskInstanceId: string | null;
    taskMasterId: string | null;
    createdBy: string;
  },
): Promise<void> {
  if (config.cardId != null) {
    const card = await db.query.cards.findFirst({
      columns: { id: true, createdBy: true },
      where: eq(cards.id, config.cardId),
      with: {
        list: {
          with: {
            board: { columns: { workspaceId: true } },
          },
        },
      },
    });

    if (!card) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Không tìm thấy thẻ gắn với cấu hình.",
      });
    }

    await assertCanEdit(
      db,
      userId,
      card.list.board.workspaceId,
      "card:edit",
      card.createdBy,
    );
  } else if (config.taskInstanceId != null) {
    if (config.createdBy !== userId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Bạn không có quyền thao tác cấu hình này.",
      });
    }
  } else if (config.taskMasterId != null) {
    const tm = await db.query.taskMasters.findFirst({
      where: eq(taskMasters.id, config.taskMasterId),
      columns: { id: true, createdBy: true, targetUser: true },
    });
    if (!tm) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Không tìm thấy task master.",
      });
    }
    if (userId !== tm.createdBy && userId !== tm.targetUser) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Bạn không có quyền thao tác cấu hình mẫu thưởng này.",
      });
    }
  } else {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Cấu hình reward không gắn card, task instance hay task master.",
    });
  }
}

type ViolationCandidate = {
  violationType: string;
  beforeValue: unknown;
  afterValue: unknown;
};

type DeductionRow = {
  reason: string;
  unitType: string;
  value: string;
  displayOrder: number;
};

function parseSnapshotDeductions(raw: unknown): DeductionRow[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((r: Record<string, unknown>, i: number) => ({
    reason: String(r?.reason ?? "").trim(),
    unitType: String(r?.unitType ?? ""),
    value: String(r?.value ?? "").trim(),
    displayOrder: Number(r?.displayOrder ?? i),
  }));
}

/**
 * Snapshot JSON chỉ các field khấu trừ cần thiết — giữ nguyên % (unitType + value),
 * không quy đổi sang tiền (thưởng trách nhiệm có thể 0đ).
 */
function serializeSnapshotDeductions(
  rows: Array<{
    reason: string;
    unitType: string;
    value: string;
    displayOrder: number;
  }>,
): DeductionRow[] {
  return rows.map((r, i) => ({
    reason: String(r.reason ?? "").trim(),
    unitType: String(r.unitType ?? "").trim(),
    value: String(r.value ?? "").trim(),
    displayOrder: Number(r.displayOrder ?? i),
  }));
}

function sameCalendarDay(
  a: Date | null | undefined,
  b: Date | null | undefined,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function sortDeductionRows(rows: DeductionRow[]): DeductionRow[] {
  return [...rows].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** So khớp một nhóm khấu trừ theo reason (chỉ so unitType + value). */
function deductionGroupMatchesSnapshot(
  snapped: DeductionRow[],
  current: DeductionRow[],
  reason: string,
): boolean {
  const s = sortDeductionRows(snapped.filter((r) => r.reason === reason));
  const c = sortDeductionRows(current.filter((r) => r.reason === reason));
  if (s.length !== c.length) return false;
  return s.every((row, i) => {
    const cr = c[i];
    return (
      row.unitType === cr?.unitType && String(row.value) === String(cr?.value)
    );
  });
}

// ─── Helper: violations khi duyệt — chỉ deadline_extended (dời deadline / timeline).
// Khấu trừ "trễ hạn" không quyết qua màn duyệt này.

function detectViolations(params: {
  card: {
    title: string;
    startDate: Date | null;
    dueDate: Date | null;
    targetUser: string | null;
  };
  snapshot: {
    snappedStartDate: Date | null;
    snappedDueDate: Date | null;
    snappedDeductions: unknown;
  };
  currentDeductions: Array<{
    reason: string;
    unitType: string;
    value: string;
    displayOrder: number;
  }>;
}): ViolationCandidate[] {
  const { card, snapshot, currentDeductions } = params;
  const candidates: ViolationCandidate[] = [];

  const snapped = parseSnapshotDeductions(snapshot.snappedDeductions);
  const current: DeductionRow[] = currentDeductions.map((d, i) => ({
    reason: String(d.reason ?? "").trim(),
    unitType: String(d.unitType ?? ""),
    value: String(d.value ?? "").trim(),
    displayOrder: Number(d.displayOrder ?? i),
  }));

  const timelineDrift =
    !sameCalendarDay(card.startDate, snapshot.snappedStartDate) ||
    !sameCalendarDay(card.dueDate, snapshot.snappedDueDate);

  const moveRowDrift = !deductionGroupMatchesSnapshot(
    snapped,
    current,
    REWARD_DEDUCTION_REASON.MOVE,
  );

  if (timelineDrift || moveRowDrift) {
    candidates.push({
      violationType: "deadline_extended",
      beforeValue: {
        startDate: snapshot.snappedStartDate?.toISOString() ?? null,
        dueDate: snapshot.snappedDueDate?.toISOString() ?? null,
        deadlineMoveDeductions: sortDeductionRows(
          snapped.filter((r) => r.reason === REWARD_DEDUCTION_REASON.MOVE),
        ),
      },
      afterValue: {
        startDate: card.startDate?.toISOString() ?? null,
        dueDate: card.dueDate?.toISOString() ?? null,
        deadlineMoveDeductions: sortDeductionRows(
          current.filter((r) => r.reason === REWARD_DEDUCTION_REASON.MOVE),
        ),
      },
    });
  }

  return candidates;
}

/**
 * Resolve the "live" entity data for violation detection.
 */
async function resolveEntityForConfig(
  db: dbClient,
  config: { cardId: number | null; taskInstanceId: string | null },
): Promise<{
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
  targetUser: string | null;
} | null> {
  if (config.cardId != null) {
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, config.cardId),
      columns: {
        title: true,
        startDate: true,
        dueDate: true,
        targetUser: true,
      },
    });
    if (!card) return null;
    return {
      title: card.title,
      startDate: card.startDate,
      dueDate: card.dueDate,
      targetUser: card.targetUser,
    };
  }

  if (config.taskInstanceId != null) {
    const instance = await db.query.taskInstances.findFirst({
      where: eq(taskInstances.id, config.taskInstanceId),
      columns: {
        targetDate: true,
        endDate: true,
        userId: true,
      },
      with: { taskMaster: { columns: { name: true } } },
    });
    if (!instance || !instance.taskMaster) return null;

    return {
      title: instance.taskMaster.name ?? "",
      startDate: instance.targetDate,
      dueDate: instance.endDate,
      targetUser: instance.userId,
    };
  }

  return null;
}

export const rewardConfigRouter = createTRPCRouter({
  // ───────────────────────────────────────────────────────────────────────────
  // [QUERY] Lấy config (kèm deductions) theo cardId
  // Quyền: member (ai cũng xem được card của mình)
  // ───────────────────────────────────────────────────────────────────────────
  getByCardId: protectedProcedure
    .input(z.object({ cardPublicId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const card = await ctx.db.query.cards.findFirst({
        where: eq(cards.publicId, input.cardPublicId),
      });

      if (!card) {
        throw new TRPCError({
          message: "Card not found",
          code: "NOT_FOUND",
        });
      }

      const row = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.cardId, card.id),
        with: {
          userApprovedBy: {
            columns: { id: true, name: true, email: true, image: true },
          },
          deductions: {
            orderBy: (t, { asc }) => [asc(t.displayOrder)],
          },
          snapshot: true,
          logs: {
            orderBy: (l, { desc: d }) => [d(l.detectedAt)],
            with: {
              deduction: true,
            },
          },
          finalization: {
            with: {
              finalizedBy: {
                columns: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      });

      if (!row) return null;

      const {
        userApprovedBy,
        deductions,
        snapshot,
        logs,
        finalization,
        ...configRest
      } = row;

      return {
        ...configRest,
        deductions,
        snapshot: snapshot ?? null,
        logs: logs ?? [],
        finalization: finalization ?? null,
        approvedByUser: userApprovedBy
          ? {
              id: userApprovedBy.id,
              name: userApprovedBy.name,
              email: userApprovedBy.email,
              image: userApprovedBy.image,
            }
          : null,
        finalizedByUser: finalization?.finalizedBy
          ? {
              id: finalization.finalizedBy.id,
              name: finalization.finalizedBy.name,
              email: finalization.finalizedBy.email,
              image: finalization.finalizedBy.image,
            }
          : null,
      };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [QUERY] Lấy config (kèm deductions) theo taskInstanceId — calendar / task master
  // ───────────────────────────────────────────────────────────────────────────
  getByTaskInstanceId: protectedProcedure
    .input(z.object({ taskInstanceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const instance = await ctx.db.query.taskInstances.findFirst({
        where: eq(taskInstances.id, input.taskInstanceId),
        columns: { id: true },
      });

      if (!instance) {
        throw new TRPCError({
          message: "Task instance not found",
          code: "NOT_FOUND",
        });
      }

      const row = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.taskInstanceId, input.taskInstanceId),
        with: {
          userApprovedBy: {
            columns: { id: true, name: true, email: true, image: true },
          },
          deductions: {
            orderBy: (t, { asc }) => [asc(t.displayOrder)],
          },
          snapshot: true,
          logs: {
            orderBy: (l, { desc: d }) => [d(l.detectedAt)],
            with: {
              deduction: true,
            },
          },
          finalization: {
            with: {
              finalizedBy: {
                columns: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      });

      if (!row) return null;

      const {
        userApprovedBy,
        deductions,
        snapshot,
        logs,
        finalization,
        ...configRest
      } = row;

      return {
        ...configRest,
        deductions,
        snapshot: snapshot ?? null,
        logs: logs ?? [],
        finalization: finalization ?? null,
        approvedByUser: userApprovedBy
          ? {
              id: userApprovedBy.id,
              name: userApprovedBy.name,
              email: userApprovedBy.email,
              image: userApprovedBy.image,
            }
          : null,
        finalizedByUser: finalization?.finalizedBy
          ? {
              id: finalization.finalizedBy.id,
              name: finalization.finalizedBy.name,
              email: finalization.finalizedBy.email,
              image: finalization.finalizedBy.image,
            }
          : null,
      };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [QUERY] Mẫu thưởng theo taskMasterId (calendar — chỉnh sửa master)
  // ───────────────────────────────────────────────────────────────────────────
  getByTaskMasterId: protectedProcedure
    .input(z.object({ taskMasterId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const master = await ctx.db.query.taskMasters.findFirst({
        where: eq(taskMasters.id, input.taskMasterId),
        columns: { id: true, createdBy: true, targetUser: true },
      });

      if (!master) {
        throw new TRPCError({
          message: "Task master not found",
          code: "NOT_FOUND",
        });
      }

      if (userId !== master.createdBy && userId !== master.targetUser) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Bạn không có quyền xem cấu hình mẫu thưởng này.",
        });
      }

      const row = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.taskMasterId, input.taskMasterId),
        with: {
          userApprovedBy: {
            columns: { id: true, name: true, email: true, image: true },
          },
          deductions: {
            orderBy: (t, { asc }) => [asc(t.displayOrder)],
          },
          snapshot: true,
          logs: {
            orderBy: (l, { desc: d }) => [d(l.detectedAt)],
            with: {
              deduction: true,
            },
          },
          finalization: {
            with: {
              finalizedBy: {
                columns: { id: true, name: true, email: true, image: true },
              },
            },
          },
        },
      });

      if (!row) return null;

      const {
        userApprovedBy,
        deductions,
        snapshot,
        logs,
        finalization,
        ...configRest
      } = row;

      return {
        ...configRest,
        deductions,
        snapshot: snapshot ?? null,
        logs: logs ?? [],
        finalization: finalization ?? null,
        approvedByUser: userApprovedBy
          ? {
              id: userApprovedBy.id,
              name: userApprovedBy.name,
              email: userApprovedBy.email,
              image: userApprovedBy.image,
            }
          : null,
        finalizedByUser: finalization?.finalizedBy
          ? {
              id: finalization.finalizedBy.id,
              name: finalization.finalizedBy.name,
              email: finalization.finalizedBy.email,
              image: finalization.finalizedBy.image,
            }
          : null,
      };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [QUERY] Lấy danh sách config đang chờ duyệt của board
  // ───────────────────────────────────────────────────────────────────────────
  getPendingApprovals: protectedProcedure
    .input(
      z.object({
        boardPublicId: z.string().min(1),
        selectedUserId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const board = await ctx.db.query.boards.findFirst({
        where: eq(boards.publicId, input.boardPublicId),
      });

      if (!board) {
        throw new TRPCError({
          message: "Board not found",
          code: "NOT_FOUND",
        });
      }

      const queryParams: any = [
        eq(cardRewardConfigs.approvalStatus, "waiting_approval"),
        eq(lists.boardId, board.id),
      ];

      if (input.selectedUserId) {
        queryParams.push(eq(cards.targetUser, input.selectedUserId));
      }

      const pendingConfigs = await ctx.db
        .select({
          config: cardRewardConfigs,
        })
        .from(cardRewardConfigs)
        .innerJoin(cards, eq(cardRewardConfigs.cardId, cards.id))
        .innerJoin(lists, eq(cards.listId, lists.id))
        .where(and(...queryParams));

      const results = [];

      for (const { config } of pendingConfigs) {
        const deductions = await ctx.db.query.cardRewardDeductions.findMany({
          where: eq(cardRewardDeductions.configId, config.id),
          orderBy: (t, { asc }) => [asc(t.displayOrder)],
        });

        const snapshot = await ctx.db.query.cardRewardSnapshots.findFirst({
          where: eq(cardRewardSnapshots.configId, config.id),
        });

        results.push({ ...config, deductions, snapshot: snapshot ?? null });
      }

      return results;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [MUTATION] Tạo mới hoặc cập nhật config + deductions (upsert)
  // Quyền: member
  // Trạng thái cho phép: draft, waiting_approval, rejected
  // Logic deductions: diff id list → delete removed, upsert rest
  // ───────────────────────────────────────────────────────────────────────────
  upsert: protectedProcedure
    .input(upsertConfigSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const {
        cardPublicId,
        taskInstanceId,
        taskMasterId,
        rewardType,
        bonusAmount,
        currency,
        deductions,
      } = input;
      const now = new Date();

      // Main transaction: upsert config + deductions + insert card_activities
      const txResult = await ctx.db.transaction(async (tx) => {
        let resolvedCardId: number | null = null;
        let resolvedTaskInstanceId: string | null = null;
        let resolvedTaskMasterId: string | null = null;

        if (cardPublicId && cardPublicId.trim().length > 0) {
          const card = await tx.query.cards.findFirst({
            where: eq(cards.publicId, cardPublicId),
          });
          if (!card) {
            throw new TRPCError({
              message: "Card not found",
              code: "NOT_FOUND",
            });
          }
          resolvedCardId = card.id;
        } else if (taskInstanceId) {
          const instance = await tx.query.taskInstances.findFirst({
            where: eq(taskInstances.id, taskInstanceId),
          });
          if (!instance) {
            throw new TRPCError({
              message: "Task instance not found",
              code: "NOT_FOUND",
            });
          }
          resolvedTaskInstanceId = taskInstanceId;
        } else if (taskMasterId) {
          const master = await tx.query.taskMasters.findFirst({
            where: eq(taskMasters.id, taskMasterId),
            columns: { id: true, createdBy: true, targetUser: true },
          });
          if (!master) {
            throw new TRPCError({
              message: "Task master not found",
              code: "NOT_FOUND",
            });
          }
          if (userId !== master.createdBy && userId !== master.targetUser) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Bạn không có quyền chỉnh sửa cấu hình mẫu thưởng này.",
            });
          }
          resolvedTaskMasterId = taskMasterId;
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Thiếu nguồn cấu hình (card / task instance / task master).",
          });
        }

        const isMasterTemplate = resolvedTaskMasterId != null;

        const existing =
          resolvedCardId != null
            ? await tx.query.cardRewardConfigs.findFirst({
                where: eq(cardRewardConfigs.cardId, resolvedCardId),
              })
            : resolvedTaskInstanceId != null
              ? await tx.query.cardRewardConfigs.findFirst({
                  where: eq(
                    cardRewardConfigs.taskInstanceId,
                    resolvedTaskInstanceId,
                  ),
                })
              : await tx.query.cardRewardConfigs.findFirst({
                  where: eq(
                    cardRewardConfigs.taskMasterId,
                    resolvedTaskMasterId!,
                  ),
                });

        let configId: number;
        let status:
          | "draft"
          | "waiting_approval"
          | "rejected"
          | "completed"
          | "approved"
          | "waiting_evaluation" = "draft";

        if (!existing) {
          const [created] = await tx
            .insert(cardRewardConfigs)
            .values({
              ...(resolvedCardId != null
                ? { cardId: resolvedCardId }
                : resolvedTaskInstanceId != null
                  ? { taskInstanceId: resolvedTaskInstanceId }
                  : { taskMasterId: resolvedTaskMasterId! }),
              rewardType,
              bonusAmount: bonusAmount?.toString() ?? null,
              currency,
              approvalStatus: "draft",
              createdBy: userId,
              createdAt: now,
            })
            .returning({
              id: cardRewardConfigs.id,
              approvalStatus: cardRewardConfigs.approvalStatus,
            });

          if (!created) {
            throw new TRPCError({
              message: "Failed to create reward config",
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          configId = created.id;
          status = created.approvalStatus;
        } else {
          assertEditable(existing.approvalStatus, "cập nhật");

          const isApproved =
            !isMasterTemplate && existing.approvalStatus === "approved";
          const newStatus = isMasterTemplate
            ? ("draft" as const)
            : isApproved || existing.approvalStatus === "rejected"
              ? ("draft" as const)
              : (existing.approvalStatus as any);

          if (isApproved) {
            await tx.insert(cardRewardLogs).values({
              configId: existing.id,
              violationType: "reward_config_changed",
              beforeValue: {
                status: existing.approvalStatus,
                rewardType: existing.rewardType,
                bonusAmount: existing.bonusAmount,
                currency: existing.currency,
              },
              afterValue: {
                status: newStatus,
                rewardType,
                bonusAmount: bonusAmount?.toString() ?? null,
                currency,
              },
              detectedAt: now,
            });
          }

          await tx
            .update(cardRewardConfigs)
            .set({
              rewardType,
              bonusAmount:
                rewardType === "responsibility"
                  ? null
                  : (bonusAmount?.toString() ?? null),
              currency,
              approvalStatus: newStatus,
              updatedAt: now,
            })
            .where(eq(cardRewardConfigs.id, existing.id));

          configId = existing.id;
          status = newStatus;
        }

        // Upsert deductions (diff approach)
        const incomingWithId = deductions.filter((d) => d.id != null);
        const incomingNew = deductions.filter((d) => d.id == null);

        const keepIds = incomingWithId.map((d) => d.id!);
        if (keepIds.length > 0) {
          await tx.delete(cardRewardDeductions).where(
            and(
              eq(cardRewardDeductions.configId, configId),
              sql`${cardRewardDeductions.id} NOT IN (${sql.join(
                keepIds.map((id) => sql`${id}`),
                sql`, `,
              )})`,
            ),
          );
        } else {
          await tx
            .delete(cardRewardDeductions)
            .where(eq(cardRewardDeductions.configId, configId));
        }

        for (const d of incomingWithId) {
          await tx
            .update(cardRewardDeductions)
            .set({
              reason: d.reason,
              unitType: d.unitType,
              value: d.value,
              displayOrder: d.displayOrder,
              updatedAt: now,
            })
            .where(
              and(
                eq(cardRewardDeductions.id, d.id!),
                eq(cardRewardDeductions.configId, configId),
              ),
            );
        }

        if (incomingNew.length > 0) {
          await tx.insert(cardRewardDeductions).values(
            incomingNew.map((d) => ({
              configId,
              reason: d.reason,
              unitType: d.unitType,
              value: d.value,
              displayOrder: d.displayOrder,
              createdAt: now,
            })),
          );
        }

        // Ghi card_activity để hiển thị trong feed (chỉ áp dụng cho card-based)
        if (resolvedCardId != null) {
          const activityEntries: Parameters<
            typeof cardActivityRepo.bulkCreate
          >[1] = [
            {
              type: "updated_reward_config" as const,
              cardId: resolvedCardId,
              createdBy: userId,
              metadata: {
                configId,
                rewardType,
                bonusAmount: bonusAmount?.toString() ?? null,
              } as Record<string, unknown>,
            },
          ];
          if (deductions.length > 0) {
            activityEntries.push({
              type: "updated_deduction" as const,
              cardId: resolvedCardId,
              createdBy: userId,
              metadata: { configId, count: deductions.length } as Record<
                string,
                unknown
              >,
            });
          }
          await cardActivityRepo.bulkCreate(tx, activityEntries);
        }

        return { configId, hasDeductions: deductions.length > 0, status };
      });

      // Fire-and-forget audit logs in card_reward_logs
      logConfigAudit({
        db: ctx.db,
        configId: txResult.configId,
        violationType: "reward_config_changed",
        beforeValue: null,
        afterValue: {
          rewardType,
          bonusAmount: bonusAmount?.toString() ?? null,
          currency,
        },
      }).catch(() => void 0);

      if (txResult.hasDeductions) {
        logConfigAudit({
          db: ctx.db,
          configId: txResult.configId,
          violationType: "deduction_changed",
          beforeValue: null,
          afterValue: { count: deductions.length },
        }).catch(() => void 0);
      }

      return { configId: txResult.configId, status: txResult.status };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [MUTATION] Submit: DRAFT → WAITING_APPROVAL
  // Quyền: member (người tạo config)
  // ───────────────────────────────────────────────────────────────────────────
  submit: protectedProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy cấu hình.",
        });
      }

      assertConfigIsNotMasterTemplate(config);

      await assertUserCanActOnCardRewardConfig(ctx.db, userId, {
        cardId: config.cardId,
        taskInstanceId: config.taskInstanceId,
        taskMasterId: config.taskMasterId,
        createdBy: config.createdBy,
      });

      if (config.approvalStatus !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chỉ có thể submit khi đang ở trạng thái draft (hiện tại: ${config.approvalStatus}).`,
        });
      }

      await ctx.db
        .update(cardRewardConfigs)
        .set({ approvalStatus: "waiting_approval", updatedAt: new Date() })
        .where(eq(cardRewardConfigs.id, input.configId));

      return { success: true };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [MUTATION] Withdraw: WAITING_APPROVAL → DRAFT
  // Quyền: member (người tạo config) hoặc manager/admin
  // ───────────────────────────────────────────────────────────────────────────
  withdraw: protectedProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          message: "User not authenticated",
          code: "UNAUTHORIZED",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy cấu hình.",
        });
      }

      assertConfigIsNotMasterTemplate(config);

      await assertUserCanActOnCardRewardConfig(ctx.db, userId, {
        cardId: config.cardId,
        taskInstanceId: config.taskInstanceId,
        taskMasterId: config.taskMasterId,
        createdBy: config.createdBy,
      });

      if (config.approvalStatus !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chỉ có thể rút lại khi đang ở trạng thái waiting_approval (hiện tại: ${config.approvalStatus}).`,
        });
      }

      await ctx.db
        .update(cardRewardConfigs)
        .set({ approvalStatus: "draft", updatedAt: new Date() })
        .where(eq(cardRewardConfigs.id, input.configId));

      return { success: true };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // BƯỚC 1: Preview violations
  // ───────────────────────────────────────────────────────────────────────────
  previewViolations: protectedProcedure
    .input(
      z.object({
        configId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { configId } = input;

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, configId),
      });

      // if (!config) {
      //   throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      // }

      // if (cardPublicId) {
      //   const card = await ctx.db.query.cards.findFirst({ where: eq(cards.publicId, cardPublicId) });
      //   if (card) config = await ctx.db.query.cardRewardConfigs.findFirst({ where: eq(cardRewardConfigs.cardId, card.id) });
      // } else if (taskInstanceId) {
      //   config = await ctx.db.query.cardRewardConfigs.findFirst({ where: eq(cardRewardConfigs.taskInstanceId, taskInstanceId) });
      // }

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy cấu hình.",
        });
      }

      assertConfigIsNotMasterTemplate(config);

      if (config.approvalStatus !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chỉ xem preview khi config đang ở waiting_approval.",
        });
      }

      const [entity, currentDeductions, existingSnapshot] = await Promise.all([
        resolveEntityForConfig(ctx.db, {
          cardId: config.cardId,
          taskInstanceId: config.taskInstanceId,
        }),
        ctx.db.query.cardRewardDeductions.findMany({
          where: eq(cardRewardDeductions.configId, config.id),
          orderBy: (t, { asc }) => [asc(t.displayOrder)],
        }),
        ctx.db.query.cardRewardSnapshots.findFirst({
          where: eq(cardRewardSnapshots.configId, config.id),
        }),
      ]);

      if (!entity) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy đối tượng liên kết (card hoặc task).",
        });
      }

      const violations = existingSnapshot
        ? detectViolations({
            card: entity,
            snapshot: existingSnapshot,
            currentDeductions,
          })
        : [];

      return {
        violations,
        availableDeductions: currentDeductions.map((d) => ({
          id: d.id,
          reason: d.reason,
          unitType: d.unitType,
          value: d.value,
          displayOrder: d.displayOrder,
        })),
        cardSnapshot: {
          title: entity.title,
          startDate: entity.startDate,
          dueDate: entity.dueDate,
          targetUser: entity.targetUser,
        },
      };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // BƯỚC 2: Approve (chính thức)
  // ───────────────────────────────────────────────────────────────────────────
  approve: protectedProcedure
    .input(
      z.object({
        configId: z.number().int().positive(),
        logDecisions: z
          .array(
            z.object({
              violationType: z.string(),
              deductionId: z.number().int().positive().nullable().optional(),
              isSkipped: z.boolean().default(false),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });
      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy cấu hình.",
        });
      }

      assertConfigIsNotMasterTemplate(config);

      if (config.approvalStatus !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chỉ có thể duyệt khi đang ở trạng thái waiting_approval (hiện tại: ${config.approvalStatus}).`,
        });
      }

      const now = new Date();

      await ctx.db.transaction(async (tx) => {
        const [entity, currentDeductions, existingSnapshot] = await Promise.all(
          [
            resolveEntityForConfig(tx, {
              cardId: config.cardId,
              taskInstanceId: config.taskInstanceId,
            }),
            tx.query.cardRewardDeductions.findMany({
              where: eq(cardRewardDeductions.configId, input.configId),
              orderBy: (t, { asc }) => [asc(t.displayOrder)],
            }),
            tx.query.cardRewardSnapshots.findFirst({
              where: eq(cardRewardSnapshots.configId, input.configId),
            }),
          ],
        );

        if (!entity) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Không tìm thấy đối tượng liên kết (card hoặc task).",
          });
        }

        const violations = existingSnapshot
          ? detectViolations({
              card: entity,
              snapshot: existingSnapshot,
              currentDeductions,
            })
          : [];

        if (violations.length > 0) {
          const decisionMap = new Map(
            input.logDecisions.map((d) => [d.violationType, d]),
          );

          for (const v of violations) {
            const decision = decisionMap.get(v.violationType);
            if (!decision || decision.isSkipped || !decision.deductionId)
              continue;
            const deduction = currentDeductions.find(
              (d) => d.id === decision.deductionId,
            );
            if (!deduction) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Mức khấu trừ đã chọn không hợp lệ.",
              });
            }
            if (
              v.violationType === "deadline_extended" &&
              deduction.reason !== REWARD_DEDUCTION_REASON.MOVE
            ) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Loại khấu trừ phải là mức khấu trừ dời deadline.",
              });
            }
          }

          await tx.insert(cardRewardLogs).values(
            violations.map((v) => {
              const decision = decisionMap.get(v.violationType);
              return {
                configId: input.configId,
                violationType: v.violationType as any,
                beforeValue: v.beforeValue,
                afterValue: v.afterValue,
                detectedAt: now,
                isSkipped: decision?.isSkipped ?? false,
                deductionId: decision?.isSkipped
                  ? null
                  : (decision?.deductionId ?? null),
              };
            }),
          );
        }

        await tx
          .insert(cardRewardSnapshots)
          .values({
            configId: input.configId,
            snappedCardTitle: entity.title,
            snappedStartDate: entity.startDate,
            snappedDueDate: entity.dueDate,
            snappedTargetUser: entity.targetUser,
            snappedRewardType: config.rewardType,
            snappedBonusAmount: config.bonusAmount,
            snappedCurrency: config.currency ?? "VND",
            snappedDeductions: serializeSnapshotDeductions(currentDeductions),
            snapshotAt: now,
            snapshotBy: userId,
          })
          .onConflictDoUpdate({
            target: cardRewardSnapshots.configId,
            set: {
              snappedCardTitle: entity.title,
              snappedStartDate: entity.startDate,
              snappedDueDate: entity.dueDate,
              snappedTargetUser: entity.targetUser,
              snappedRewardType: config.rewardType,
              snappedBonusAmount: config.bonusAmount,
              snappedCurrency: config.currency ?? "VND",
              snappedDeductions: serializeSnapshotDeductions(currentDeductions),
              snapshotAt: now,
              snapshotBy: userId,
            },
          });

        await tx
          .update(cardRewardConfigs)
          .set({
            approvalStatus: "approved",
            approvedBy: userId,
            approvedAt: now,
            rejectedReason: null,
            updatedAt: now,
          })
          .where(eq(cardRewardConfigs.id, input.configId));
      });

      return { success: true };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [MUTATION] Reject: WAITING_APPROVAL → REJECTED
  // ───────────────────────────────────────────────────────────────────────────
  reject: protectedProcedure
    .input(
      z.object({
        configId: z.number().int().positive(),
        rejectedReason: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });

      const user = await userRepo.getById(ctx.db, userId);
      if (!user || user.role !== "ADMIN") {
        throw new TRPCError({
          message: "User is not admin",
          code: "UNAUTHORIZED",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy cấu hình.",
        });
      }

      assertConfigIsNotMasterTemplate(config);

      if (config.approvalStatus !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chỉ có thể từ chối khi đang ở trạng thái waiting_approval (hiện tại: ${config.approvalStatus}).`,
        });
      }

      await ctx.db
        .update(cardRewardConfigs)
        .set({
          approvalStatus: "rejected",
          rejectedReason: input.rejectedReason,
          updatedAt: new Date(),
        })
        .where(eq(cardRewardConfigs.id, input.configId));

      return { success: true };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [MUTATION] Revert: Khôi phục entity về đúng Snapshot và tái-APPROVE config
  // ───────────────────────────────────────────────────────────────────────────
  revert: protectedProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;
      if (!userId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });

      return ctx.db.transaction(async (tx) => {
        const config = await tx.query.cardRewardConfigs.findFirst({
          where: eq(cardRewardConfigs.id, input.configId),
        });

        if (!config)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Không tìm thấy cấu hình.",
          });

        assertConfigIsNotMasterTemplate(config);

        if (config.approvalStatus !== "draft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Chỉ có thể revert khi config đang ở trạng thái draft (hiện tại: ${config.approvalStatus}).`,
          });
        }

        const snapshot = await tx.query.cardRewardSnapshots.findFirst({
          where: eq(cardRewardSnapshots.configId, input.configId),
        });

        if (!snapshot)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Không tìm thấy snapshot.",
          });

        const now = new Date();
        const liveEntity = await resolveEntityForConfig(ctx.db, {
          cardId: config.cardId,
          taskInstanceId: config.taskInstanceId,
        });

        if (config.cardId != null) {
          await tx
            .update(cards)
            .set({
              title: snapshot.snappedCardTitle,
              startDate: snapshot.snappedStartDate,
              dueDate: snapshot.snappedDueDate,
              targetUser: snapshot.snappedTargetUser,
              updatedAt: now,
            })
            .where(eq(cards.id, config.cardId!));
        } else if (config.taskInstanceId != null) {
          await tx
            .update(taskInstances)
            .set({
              userId: snapshot.snappedTargetUser!,
              targetDate: snapshot.snappedStartDate,
              endDate: snapshot.snappedDueDate,
              updatedAt: now,
            })
            .where(eq(taskInstances.id, config.taskInstanceId));
        }

        // 3. Khôi phục config fields + tái-approve (DRAFT → APPROVED)
        //    Giữ nguyên approvedBy/approvedAt từ lần approve trước.
        await tx
          .update(cardRewardConfigs)
          .set({
            approvalStatus: "approved",
            rewardType: snapshot.snappedRewardType,
            bonusAmount: snapshot.snappedBonusAmount,
            currency: snapshot.snappedCurrency,
            rejectedReason: null,
            updatedAt: now,
          })
          .where(eq(cardRewardConfigs.id, input.configId));

        // 4. Khôi phục deductions: xóa hiện tại → insert lại từ snappedDeductions
        await tx
          .delete(cardRewardDeductions)
          .where(eq(cardRewardDeductions.configId, input.configId));

        type SnappedDeductionItem = {
          reason: string;
          unitType: "percent" | "vnd";
          value: string;
          displayOrder: number;
        };
        const snappedItems =
          (snapshot.snappedDeductions as SnappedDeductionItem[] | null) ?? [];

        if (snappedItems.length > 0) {
          await tx.insert(cardRewardDeductions).values(
            snappedItems.map((item, i) => ({
              configId: input.configId,
              reason: item.reason,
              unitType: item.unitType,
              value: item.value,
              displayOrder: item.displayOrder ?? i,
              createdAt: now,
            })),
          );
        }

        return { success: true, restoredTitle: snapshot.snappedCardTitle };
      });
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [MUTATION] Finalize: Chốt Nghiệm thu & Freeze Data (WAITING_EVALUATION → COMPLETED)
  // Quyền: ADMIN / AREA_MANAGER / BRANCH_MANAGER
  // Lấy danh sách vi phạm không bị skip, chuyển ra deduction và tính final_amount
  // ───────────────────────────────────────────────────────────────────────────
  finalize: protectedProcedure
    .input(
      z.object({
        configId: z.number().int().positive(),
        final_percent: z.number().min(0).max(100),
        final_note: z.string().optional(),
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

      const user = await userRepo.getById(ctx.db, userId);

      if (!user) {
        throw new TRPCError({
          message: "User not found",
          code: "NOT_FOUND",
        });
      }

      if (!["ADMIN", "AREA_MANAGER", "BRANCH_MANAGER"].includes(user.role)) {
        throw new TRPCError({
          message:
            "Bạn không có quyền nghiệm thu (yêu cầu ADMIN hoặc MANAGER).",
          code: "UNAUTHORIZED",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy cấu hình.",
        });
      }

      assertConfigIsNotMasterTemplate(config);

      if (config.approvalStatus !== "waiting_evaluation") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chỉ có thể nghiệm thu khi đang ở trạng thái waiting_evaluation (hiện tại: ${config.approvalStatus}).`,
        });
      }

      const snapshot = await ctx.db.query.cardRewardSnapshots.findFirst({
        where: eq(cardRewardSnapshots.configId, input.configId),
      });

      if (!snapshot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Không tìm thấy snapshot cho cấu hình này.",
        });
      }

      // Lấy danh sách logs phạt chưa bị skip (isSkipped = false) của config này có deductionId
      const activeLogsAndDeductions = await ctx.db
        .select({
          log: cardRewardLogs,
          deduction: cardRewardDeductions,
        })
        .from(cardRewardLogs)
        .leftJoin(
          cardRewardDeductions,
          eq(cardRewardLogs.deductionId, cardRewardDeductions.id),
        )
        .where(
          and(
            eq(cardRewardLogs.configId, input.configId),
            eq(cardRewardLogs.isSkipped, false),
          ),
        );

      let totalDeductionVND = 0;
      const baseBonus = Number(snapshot.snappedBonusAmount || 0);

      for (const row of activeLogsAndDeductions) {
        if (row.deduction) {
          // Map sang card_reward_deductions để lấy giá trị cần khấu trừ
          const dedValue = Number(row.deduction.value);
          if (row.deduction.unitType === "vnd") {
            totalDeductionVND += dedValue;
          } else if (row.deduction.unitType === "percent") {
            totalDeductionVND += baseBonus * (dedValue / 100);
          }
        }
      }

      const baseAmount = baseBonus * (input.final_percent / 100);
      let finalAmount = baseAmount - totalDeductionVND;

      // Không cho âm
      if (finalAmount < 0) {
        finalAmount = 0;
      }

      const now = new Date();

      await ctx.db.transaction(async (tx) => {
        // Insert or update card_reward_finalizations
        await tx
          .insert(cardRewardFinalizations)
          .values({
            configId: input.configId,
            completionPercent: input.final_percent.toString(),
            suggestedAmount: baseAmount.toString(),
            finalAmount: finalAmount.toString(),
            finalNote: input.final_note,
            finalizedBy: userId,
            finalizedAt: now,
          })
          .onConflictDoUpdate({
            target: cardRewardFinalizations.configId,
            set: {
              completionPercent: input.final_percent.toString(),
              suggestedAmount: baseAmount.toString(),
              finalAmount: finalAmount.toString(),
              finalNote: input.final_note,
              finalizedBy: userId,
              finalizedAt: now, // cập nhật thời gian
            },
          });

        // Update approvalStatus = completed
        await tx
          .update(cardRewardConfigs)
          .set({
            approvalStatus: "completed",
            updatedAt: now,
          })
          .where(eq(cardRewardConfigs.id, input.configId));

        // Gọi hàm audit log (pure audit logic) do trạng thái config sẽ là completed, trackCardRewardViolations skip
        // Ở đây chúng ta log ra type: finalization_created
        // Ta sẽ sử dụng logConfigAudit cũ để ghi vào event
        await tx.insert(cardRewardLogs).values({
          configId: input.configId,
          violationType: "finalization_created",
          beforeValue: {},
          afterValue: {
            finalAmount,
            completionPercent: input.final_percent,
          },
          detectedAt: now,
          isSkipped: false,
        });
      });

      return {
        success: true,
        baseBonus,
        completionPercent: input.final_percent,
        totalDeductionVND,
        finalAmount,
      };
    }),
});
