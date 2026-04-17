import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "../trpc";

import {
  cards,
  cardRewardConfigs,
  cardRewardDeductions,
  cardRewardSnapshots,
  cardRewardLogs,
  cardRewardFinalizations,
  lists,
  boards,
} from "@kan/db/schema";
import * as userRepo from "@kan/db/repository/user.repo";
import * as cardActivityRepo from "@kan/db/repository/cardActivity.repo";
import { logConfigAudit } from "../utils/rewardViolation";

const deductionItemSchema = z.object({
  id: z.number().optional(),
  reason: z.string().min(1).max(500),
  unitType: z.enum(["percent", "vnd"]),
  value: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Giá trị không hợp lệ")
    .refine(
      (v) => parseFloat(v) > 0,
      "Giá trị khấu trừ phải lớn hơn 0"
    ),
  displayOrder: z.number().int().min(0).default(0),
});

const upsertConfigSchema = z
  .object({
    cardPublicId: z.string().min(1),
    rewardType: z.enum(["project", "responsibility"]),
    /**
     * Bắt buộc khi rewardType = "project".
     * Để null / bỏ qua khi rewardType = "responsibility".
     */
    bonusAmount: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Số tiền không hợp lệ")
      .optional()
      .nullable(),
    currency: z.string().length(3).default("VND"),
    deductions: z.array(deductionItemSchema).default([]),
  })
  .refine(
    (d) =>
      d.rewardType === "responsibility" ||
      (d.bonusAmount != null && d.bonusAmount !== ""),
    {
      message: "Số tiền thưởng là bắt buộc khi loại thưởng là 'project'.",
      path: ["bonusAmount"],
    }
  );

// Config chỉ được sửa khi đang ở trạng thái cho phép.
const EDITABLE_STATUSES = ["draft", "waiting_approval", "rejected"] as const;

function assertEditable(
  status: string,
  action = "chỉnh sửa"
) {
  if (!EDITABLE_STATUSES.includes(status as any)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Không thể ${action} cấu hình ở trạng thái "${status}".`,
    });
  }
}

type ViolationCandidate = {
  violationType: string;
  beforeValue: unknown;
  afterValue: unknown;
};
 
// ─── Helper: detect violations ────────────────────────────────────────────────
// Tách ra function riêng để dùng chung giữa preview và approve.
 
function detectViolations(params: {
  card: { title: string; startDate: Date | null; dueDate: Date | null; targetUser: string | null };
  config: { rewardType: string; bonusAmount: string | null; currency: string | null };
  snapshot: {
    snappedStartDate: Date | null;
    snappedDueDate: Date | null;
    snappedTargetUser: string | null;
    snappedRewardType: string;
    snappedBonusAmount: string | null;
    snappedCurrency: string;
    snappedDeductions: unknown;
  };
  currentDeductions: Array<{ reason: string; unitType: string; value: string; displayOrder: number }>;
}): ViolationCandidate[] {
  const { card, config, snapshot, currentDeductions } = params;
  const candidates: ViolationCandidate[] = [];
 
  // 1. Deadline extended
  if (card.dueDate && snapshot.snappedDueDate) {
    if (card.dueDate.getTime() > snapshot.snappedDueDate.getTime()) {
      candidates.push({
        violationType: "deadline_extended",
        beforeValue: snapshot.snappedDueDate.toISOString(),
        afterValue: card.dueDate.toISOString(),
      });
    } else if (card.dueDate.getTime() < snapshot.snappedDueDate.getTime()) {
      candidates.push({
        violationType: "deadline_shortened",
        beforeValue: snapshot.snappedDueDate.toISOString(),
        afterValue: card.dueDate.toISOString(),
      });
    }
  }
 
  // 2. Start date changed
  if (card.startDate) {
    if (
      !snapshot.snappedStartDate ||
      card.startDate.getTime() !== snapshot.snappedStartDate.getTime()
    ) {
      candidates.push({
        violationType: "start_date_changed",
        beforeValue: snapshot.snappedStartDate?.toISOString() ?? null,
        afterValue: card.startDate.toISOString(),
      });
    }
  }
 
  // 3. Assignee changed
  if (card.targetUser !== snapshot.snappedTargetUser) {
    candidates.push({
      violationType: "assignee_changed",
      beforeValue: { targetUser: snapshot.snappedTargetUser },
      afterValue: { targetUser: card.targetUser },
    });
  }
 
  // 4. Reward config changed (chỉ ghi nhận để audit, không nhất thiết trừ tiền)
  if (
    config.rewardType !== snapshot.snappedRewardType ||
    String(config.bonusAmount) !== String(snapshot.snappedBonusAmount) ||
    config.currency !== snapshot.snappedCurrency
  ) {
    candidates.push({
      violationType: "reward_config_changed",
      beforeValue: {
        rewardType: snapshot.snappedRewardType,
        bonusAmount: snapshot.snappedBonusAmount,
        currency: snapshot.snappedCurrency,
      },
      afterValue: {
        rewardType: config.rewardType,
        bonusAmount: config.bonusAmount,
        currency: config.currency,
      },
    });
  }
 
  // 5. Deductions changed
  type SnappedItem = { reason: string; unitType: string; value: string; displayOrder: number };
  const snapped = (snapshot.snappedDeductions as SnappedItem[] | null) ?? [];
  const isDiff =
    snapped.length !== currentDeductions.length ||
    snapped.some(
      (sd, i) =>
        sd.reason !== currentDeductions[i]?.reason ||
        String(sd.value) !== String(currentDeductions[i]?.value) ||
        sd.unitType !== currentDeductions[i]?.unitType
    );
  if (isDiff) {
    candidates.push({
      violationType: "deduction_changed",
      beforeValue: snapped,
      afterValue: currentDeductions,
    });
  }
 
  return candidates;
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

        const config = await ctx.db.query.cardRewardConfigs.findFirst({
            where: eq(cardRewardConfigs.cardId, card.id),
        });

        if (!config) return null;

        const deductions = await ctx.db.query.cardRewardDeductions.findMany({
            where: eq(cardRewardDeductions.configId, config.id),
            orderBy: (t, { asc }) => [asc(t.displayOrder)],
        });

        const snapshot = await ctx.db.query.cardRewardSnapshots.findFirst({
            where: eq(cardRewardSnapshots.configId, config.id),
        });

        return { ...config, deductions, snapshot: snapshot ?? null };
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // [QUERY] Lấy danh sách config đang chờ duyệt của board
  // ───────────────────────────────────────────────────────────────────────────
  getPendingApprovals: protectedProcedure
    .input(
      z.object({
        boardPublicId: z.string().min(1),
        selectedUserId: z.string().optional(),
      })
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

      const { cardPublicId, rewardType, bonusAmount, currency, deductions } = input;
      const now = new Date();

      // Main transaction: upsert config + deductions + insert card_activities
      const txResult = await ctx.db.transaction(async (tx) => {
        const card = await tx.query.cards.findFirst({
          where: eq(cards.publicId, cardPublicId),
        });

        if (!card) {
          throw new TRPCError({
            message: "Card not found",
            code: "NOT_FOUND",
          });
        }

        const existing = await tx.query.cardRewardConfigs.findFirst({
          where: eq(cardRewardConfigs.cardId, card.id),
        });

        let configId: number;

        if (!existing) {
          const [created] = await tx
            .insert(cardRewardConfigs)
            .values({
              cardId: card.id,
              rewardType,
              bonusAmount: bonusAmount ?? null,
              currency,
              approvalStatus: "draft",
              createdBy: userId,
              createdAt: now,
            })
            .returning({ id: cardRewardConfigs.id });

          if (!created) {
            throw new TRPCError({
              message: "Failed to create reward config",
              code: "INTERNAL_SERVER_ERROR",
            });
          }

          configId = created.id;
        } else {
          assertEditable(existing.approvalStatus, "cập nhật");

          await tx
            .update(cardRewardConfigs)
            .set({
              rewardType,
              bonusAmount:
                rewardType === "responsibility" ? null : (bonusAmount ?? null),
              currency,
              approvalStatus:
                existing.approvalStatus === "rejected"
                  ? "draft"
                  : existing.approvalStatus,
              updatedAt: now,
            })
            .where(eq(cardRewardConfigs.id, existing.id));

          configId = existing.id;
        }

        // Upsert deductions (diff approach)
        const incomingWithId = deductions.filter((d) => d.id != null);
        const incomingNew = deductions.filter((d) => d.id == null);

        const keepIds = incomingWithId.map((d) => d.id!);
        if (keepIds.length > 0) {
          await tx
            .delete(cardRewardDeductions)
            .where(
              and(
                eq(cardRewardDeductions.configId, configId),
                sql`${cardRewardDeductions.id} NOT IN (${sql.join(
                  keepIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
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
                eq(cardRewardDeductions.configId, configId)
              )
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
            }))
          );
        }

        // Ghi card_activity để hiển thị trong feed
        const activityEntries: Parameters<typeof cardActivityRepo.bulkCreate>[1] = [
          {
            type: "updated_reward_config" as const,
            cardId: card.id,
            createdBy: userId,
            metadata: { configId, rewardType, bonusAmount: bonusAmount ?? null } as Record<string, unknown>,
          },
        ];
        if (deductions.length > 0) {
          activityEntries.push({
            type: "updated_deduction" as const,
            cardId: card.id,
            createdBy: userId,
            metadata: { configId, count: deductions.length } as Record<string, unknown>,
          });
        }
        await cardActivityRepo.bulkCreate(tx, activityEntries);

        return { configId, hasDeductions: deductions.length > 0 };
      });

      // Fire-and-forget audit logs in card_reward_logs —
      // triggered by the newly-inserted "updated_reward_config" / "updated_deduction" activities.
      logConfigAudit({
        db: ctx.db,
        configId: txResult.configId,
        violationType: "reward_config_changed",
        beforeValue: null,
        afterValue: { rewardType, bonusAmount: bonusAmount ?? null, currency },
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

      return { configId: txResult.configId };
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

      const user = await userRepo.getById(ctx.db, userId);

      if (!user) {
        throw new TRPCError({
          message: "User not found",
          code: "NOT_FOUND",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      }

      if (config.createdBy !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền submit cấu hình này." });
      }

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

      const user = await userRepo.getById(ctx.db, userId);

      if (!user) {
        throw new TRPCError({
          message: "User not found",
          code: "NOT_FOUND",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      }

      if (config.createdBy !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Bạn không có quyền rút lại cấu hình này." });
      }

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
  //
  // Admin gọi trước khi bấm Approve để xem danh sách vi phạm.
  // Server detect violations so với snapshot cũ (nếu có), trả về:
  //   - violations: danh sách vi phạm phát hiện được
  //   - availableDeductions: danh sách deduction hiện tại để Admin chọn map
  //
  // FE dùng data này để render UI cho Admin:
  //   - Mỗi violation → dropdown chọn deductionId (hoặc "không áp dụng")
  //   - Checkbox "Bỏ qua (isSkipped)"
  //
  // Không ghi gì vào DB ở bước này.
  // ───────────────────────────────────────────────────────────────────────────
  previewViolations: protectedProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      }
      if (config.approvalStatus !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Chỉ xem preview khi config đang ở waiting_approval.",
        });
      }
 
      const [card, currentDeductions, existingSnapshot] = await Promise.all([
        ctx.db.query.cards.findFirst({ where: eq(cards.id, config.cardId) }),
        ctx.db.query.cardRewardDeductions.findMany({
          where: eq(cardRewardDeductions.configId, input.configId),
          orderBy: (t, { asc }) => [asc(t.displayOrder)],
        }),
        ctx.db.query.cardRewardSnapshots.findFirst({
          where: eq(cardRewardSnapshots.configId, input.configId),
        }),
      ]);
 
      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy card." });
      }
 
      // Chưa có snapshot → lần approve đầu tiên, không có violation cũ
      const violations = existingSnapshot
        ? detectViolations({ card, config, snapshot: existingSnapshot, currentDeductions })
        : [];
 
      return {
        /**
         * Danh sách vi phạm phát hiện so với snapshot cũ.
         * Mỗi item chứa violationType, beforeValue, afterValue.
         * FE dùng violationType để hiển thị label thân thiện.
         */
        violations,
        /**
         * Danh sách deduction hiện tại để Admin map vào từng violation.
         * FE render dropdown: "Vi phạm X → áp dụng deduction nào?"
         */
        availableDeductions: currentDeductions.map((d) => ({
          id: d.id,
          reason: d.reason,
          unitType: d.unitType,
          value: d.value,
          displayOrder: d.displayOrder,
        })),
        /** Thông tin card hiện tại để Admin đối chiếu */
        cardSnapshot: {
          title: card.title,
          startDate: card.startDate,
          dueDate: card.dueDate,
          targetUser: card.targetUser,
        },
      };
    }),
 
  // ───────────────────────────────────────────────────────────────────────────
  // BƯỚC 2: Approve (chính thức)
  //
  // FE gửi lên quyết định của Admin cho từng violation:
  //   logDecisions: [
  //     { violationType: "deadline_extended", deductionId: 5, isSkipped: false },
  //     { violationType: "assignee_changed",  deductionId: null, isSkipped: true },
  //   ]
  //
  // Server:
  //   1. Re-detect violations (không tin FE — server is source of truth)
  //   2. Ghi card_reward_logs với deductionId + isSkipped từ Admin
  //   3. Upsert snapshot mới
  //   4. Update approvalStatus → approved
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
            })
          )
          .default([]),
      })
    )
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      }
      if (config.approvalStatus !== "waiting_approval") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Chỉ có thể duyệt khi đang ở trạng thái waiting_approval (hiện tại: ${config.approvalStatus}).`,
        });
      }
 
      const now = new Date();
 
      await ctx.db.transaction(async (tx) => {
        const [card, currentDeductions, existingSnapshot] = await Promise.all([
          tx.query.cards.findFirst({ where: eq(cards.id, config.cardId) }),
          tx.query.cardRewardDeductions.findMany({
            where: eq(cardRewardDeductions.configId, input.configId),
            orderBy: (t, { asc }) => [asc(t.displayOrder)],
          }),
          tx.query.cardRewardSnapshots.findFirst({
            where: eq(cardRewardSnapshots.configId, input.configId),
          }),
        ]);
 
        if (!card) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy card." });
        }
 
        // ── 1. Re-detect violations phía server ───────────────────────────────
        // Server không tin FE tự sinh violationType.
        // FE chỉ được gửi decision (deductionId + isSkipped) cho từng type
        // mà server đã announce ở bước previewViolations.
        const violations = existingSnapshot
          ? detectViolations({ card, config, snapshot: existingSnapshot, currentDeductions })
          : [];
 
        // ── 2. Ghi logs với quyết định của Admin ─────────────────────────────
        if (violations.length > 0) {
          // Build lookup map: violationType → decision của Admin
          const decisionMap = new Map(
            input.logDecisions.map((d) => [d.violationType, d])
          );
 
          await tx.insert(cardRewardLogs).values(
            violations.map((v) => {
              const decision = decisionMap.get(v.violationType);
              return {
                configId: input.configId,
                violationType: v.violationType as any,
                beforeValue: v.beforeValue,
                afterValue: v.afterValue,
                detectedAt: now,
                // Nếu Admin skip → deductionId = null dù có truyền lên hay không
                isSkipped: decision?.isSkipped ?? false,
                deductionId:
                  decision?.isSkipped
                    ? null
                    : (decision?.deductionId ?? null),
              };
            })
          );
        }
 
        // ── 3. Upsert snapshot ────────────────────────────────────────────────
        await tx
          .insert(cardRewardSnapshots)
          .values({
            configId: input.configId,
            snappedCardTitle: card.title,
            snappedStartDate: card.startDate,
            snappedDueDate: card.dueDate,
            snappedTargetUser: card.targetUser,
            snappedRewardType: config.rewardType,
            snappedBonusAmount: config.bonusAmount,
            snappedCurrency: config.currency ?? "VND",
            snappedDeductions: currentDeductions,
            snapshotAt: now,
            snapshotBy: userId,
          })
          .onConflictDoUpdate({
            target: cardRewardSnapshots.configId,
            set: {
              snappedCardTitle: card.title,
              snappedStartDate: card.startDate,
              snappedDueDate: card.dueDate,
              snappedTargetUser: card.targetUser,
              snappedRewardType: config.rewardType,
              snappedBonusAmount: config.bonusAmount,
              snappedCurrency: config.currency ?? "VND",
              snappedDeductions: currentDeductions,
              snapshotAt: now,
              snapshotBy: userId,
            },
          });
 
        // ── 4. Update status → approved ───────────────────────────────────────
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
  // Quyền: admin only
  // ───────────────────────────────────────────────────────────────────────────
  reject: protectedProcedure
    .input(
      z.object({
        configId: z.number().int().positive(),
        rejectedReason: z
          .string()
          .min(1, "Vui lòng nhập lý do từ chối.")
          .max(1000),
      })
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

      if (user.role !== "ADMIN") {
        throw new TRPCError({
          message: "User is not admin",
          code: "UNAUTHORIZED",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      }

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
  // [MUTATION] Revert: Khôi phục Card về đúng Snapshot và tái-APPROVE config
  // Quyền: member
  // Khi nào dùng: Sau khi config bị auto-downgrade về DRAFT do vi phạm
  // ───────────────────────────────────────────────────────────────────────────
  revert: protectedProcedure
    .input(z.object({ configId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user?.id;

      if (!userId) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "User not authenticated" });
      }

      // const user = await userRepo.getById(ctx.db, userId);
      // if (!user) {
      //   throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      // }
      // if (user.role !== "ADMIN") {
      //   throw new TRPCError({ code: "UNAUTHORIZED", message: "Chỉ Admin mới được revert cấu hình." });
      // }

      return ctx.db.transaction(async (tx) => {
        // 1. Lấy config — phải đang ở DRAFT (đã bị auto-downgrade)
        const config = await tx.query.cardRewardConfigs.findFirst({
          where: eq(cardRewardConfigs.id, input.configId),
        });

        if (!config) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
        }

        if (config.approvalStatus !== "draft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Chỉ có thể revert khi config đang ở trạng thái draft (hiện tại: ${config.approvalStatus}).`,
          });
        }

        // 2. Lấy snapshot (bản chụp tại thời điểm approve gần nhất)
        const snapshot = await tx.query.cardRewardSnapshots.findFirst({
          where: eq(cardRewardSnapshots.configId, input.configId),
        });

        if (!snapshot) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Không tìm thấy snapshot. Config chưa từng được approve.",
          });
        }

        // 3. Kiểm tra card tồn tại
        const card = await tx.query.cards.findFirst({
          where: eq(cards.id, config.cardId),
        });

        if (!card) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy thẻ liên kết." });
        }

        const now = new Date();

        // 4. Khôi phục card về đúng giá trị trong snapshot
        await tx
          .update(cards)
          .set({
            title:      snapshot.snappedCardTitle,
            startDate:  snapshot.snappedStartDate,
            dueDate:    snapshot.snappedDueDate,
            targetUser: snapshot.snappedTargetUser,
            updatedAt:  now,
          })
          .where(eq(cards.id, config.cardId));

        // 5. Khôi phục config fields + tái-approve (DRAFT → APPROVED)
        //    Giữ nguyên approvedBy/approvedAt từ lần approve trước.
        await tx
          .update(cardRewardConfigs)
          .set({
            approvalStatus: "approved",
            rewardType:     snapshot.snappedRewardType,
            bonusAmount:    snapshot.snappedBonusAmount,
            currency:       snapshot.snappedCurrency,
            rejectedReason: null,
            updatedAt:      now,
          })
          .where(eq(cardRewardConfigs.id, input.configId));

        // 6. Khôi phục deductions: xóa hiện tại → insert lại từ snappedDeductions
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
              configId:     input.configId,
              reason:       item.reason,
              unitType:     item.unitType,
              value:        item.value,
              displayOrder: item.displayOrder ?? i,
              createdAt:    now,
            })),
          );
        }

        return { success: true, restoredCardTitle: snapshot.snappedCardTitle };

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
      })
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
          message: "Bạn không có quyền nghiệm thu (yêu cầu ADMIN hoặc MANAGER).",
          code: "UNAUTHORIZED",
        });
      }

      const config = await ctx.db.query.cardRewardConfigs.findFirst({
        where: eq(cardRewardConfigs.id, input.configId),
      });

      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy cấu hình." });
      }

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
        throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy snapshot cho cấu hình này." });
      }

      // Lấy danh sách logs phạt chưa bị skip (isSkipped = false) của config này có deductionId
      const activeLogsAndDeductions = await ctx.db
        .select({
           log: cardRewardLogs,
           deduction: cardRewardDeductions,
        })
        .from(cardRewardLogs)
        .leftJoin(cardRewardDeductions, eq(cardRewardLogs.deductionId, cardRewardDeductions.id))
        .where(
          and(
            eq(cardRewardLogs.configId, input.configId),
            eq(cardRewardLogs.isSkipped, false)
          )
        );

      let totalDeductionVND = 0;
      const baseBonus = Number(snapshot.snappedBonusAmount || 0);

      for (const row of activeLogsAndDeductions) {
        if (row.deduction) { // Map sang card_reward_deductions để lấy giá trị cần khấu trừ
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
         await tx.insert(cardRewardFinalizations).values({
           configId: input.configId,
           completionPercent: input.final_percent.toString(),
           suggestedAmount: baseAmount.toString(), 
           finalAmount: finalAmount.toString(),
           finalNote: input.final_note,
           finalizedBy: userId,
           finalizedAt: now,
         }).onConflictDoUpdate({
           target: cardRewardFinalizations.configId,
           set: {
             completionPercent: input.final_percent.toString(),
             suggestedAmount: baseAmount.toString(),
             finalAmount: finalAmount.toString(),
             finalNote: input.final_note,
             finalizedBy: userId,
             finalizedAt: now, // cập nhật thời gian
           }
         });

         // Update approvalStatus = completed
         await tx.update(cardRewardConfigs)
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
             completionPercent: input.final_percent 
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