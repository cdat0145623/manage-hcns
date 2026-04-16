import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "../trpc";

import {
  cards,
  cardRewardConfigs,
  cardRewardDeductions,
} from "@kan/db/schema";
import * as userRepo from "@kan/db/repository/user.repo";

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

        return { ...config, deductions };
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
    //   const userId = ctx.user?.id;

    //   if (!userId) {
    //     throw new TRPCError({
    //       message: "User not authenticated",
    //       code: "UNAUTHORIZED",
    //     });
    //   }
const userId = "c326499c-be94-419b-8d10-08dac6442e49"
      const { cardPublicId, rewardType, bonusAmount, currency, deductions } = input;
      const now = new Date();

      return ctx.db.transaction(async (tx) => {
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

        // 2. Upsert deductions (diff approach)
        const incomingWithId = deductions.filter((d) => d.id != null);
        const incomingNew = deductions.filter((d) => d.id == null);

        // Xóa các deduction không còn trong danh sách gửi lên
        const keepIds = incomingWithId.map((d) => d.id!);
        if (keepIds.length > 0) {
          await tx
            .delete(cardRewardDeductions)
            .where(
              and(
                eq(cardRewardDeductions.configId, configId),
                // Xóa những id KHÔNG nằm trong keepIds
                sql`${cardRewardDeductions.id} NOT IN (${sql.join(
                  keepIds.map((id) => sql`${id}`),
                  sql`, `
                )})`
              )
            );
        } else {
          // Không giữ lại id nào → xóa hết
          await tx
            .delete(cardRewardDeductions)
            .where(eq(cardRewardDeductions.configId, configId));
        }

        // Update các deduction đã có id
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

        // Insert các deduction mới
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

        return { configId };
      });
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

      if (
        config.createdBy !== userId &&
        !["AREA_MANAGER", "BRANCH_MANAGER", "ADMIN"].includes(user.role)
      ) {
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

      if (
        config.createdBy !== userId &&
        !["AREA_MANAGER", "BRANCH_MANAGER", "ADMIN"].includes(user.role)
      ) {
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

        await tx.insert(cardRewardSnapshots).values({
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
});

// Import thêm để dùng trong approve (tránh circular)
import { cardRewardSnapshots } from "@kan/db/schema";