import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "../trpc";

import {
  cards,
  cardRewardConfigs,
  cardRewardDeductions,
  cardRewardSnapshots,
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
  // [MUTATION] Approve: WAITING_APPROVAL → APPROVED
  // Quyền: admin only
  // Side-effect: trigger snapshot (gọi service riêng)
  // ───────────────────────────────────────────────────────────────────────────
  approve: protectedProcedure
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
          message: `Chỉ có thể duyệt khi đang ở trạng thái waiting_approval (hiện tại: ${config.approvalStatus}).`,
        });
      }

      const now = new Date();

      await ctx.db.transaction(async (tx) => {
        // 1. Update status → approved
        await tx
          .update(cardRewardConfigs)
          .set({
            approvalStatus: "approved",
            approvedBy: userId,
            approvedAt: now,
            rejectedReason: null, // xóa lý do reject cũ nếu có
            updatedAt: now,
          })
          .where(eq(cardRewardConfigs.id, input.configId));

        // 2. Tạo Snapshot
        //    Lấy thông tin card gốc từ DB và toàn bộ deductions hiện tại để bake vào JSON.
        const deductions = await tx.query.cardRewardDeductions.findMany({
          where: eq(cardRewardDeductions.configId, input.configId),
          orderBy: (t, { asc }) => [asc(t.displayOrder)],
        });

        const card = await tx.query.cards.findFirst({
          where: eq(cards.id, config.cardId),
        });

        if (!card) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Không tìm thấy thẻ liên kết." });
        }

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
            snappedDeductions: deductions,
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
              snappedDeductions: deductions,
              snapshotAt: now,
              snapshotBy: userId,
            },
          });
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
});