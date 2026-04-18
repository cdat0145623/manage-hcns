import { t } from "@lingui/macro";
import { format } from "date-fns";
import { motion } from "framer-motion";
import React from "react";
import {
  HiCalendarDays,
  HiCheck,
  HiCheckCircle,
  HiClipboardDocumentCheck,
  HiClock,
  HiExclamationCircle,
  HiPencilSquare,
} from "react-icons/hi2";

import { REWARD_DEDUCTION_REASON } from "@kan/shared/constants";

import Avatar from "~/components/Avatar";
import { detectRewardMismatch } from "~/utils/reward";

export type RewardStatus =
  | "draft"
  | "waiting_approval"
  | "approved"
  | "rejected"
  | "waiting_evaluation"
  | "completed";

interface RewardViolationLog {
  date: string;
  reason: string;
  deductionValue: number;
  /** vnd: hiển thị đ; percent: giá trị là % (không nhân thưởng gốc — dùng cho thưởng trách nhiệm). */
  deductionUnit?: "vnd" | "percent" | null;
  isSkipped?: boolean;
}

interface CardSnapshot {
  snappedCardTitle: string;
  snappedStartDate: string | Date | null;
  snappedDueDate: string | Date | null;
  snappedTargetUser: string | null;
  snappedBonusAmount: string | number | null;
  snappedCurrency: string;
  snappedDeductions: {
    reason: string;
    value: string | number;
    unitType: string;
  }[];
  assigneeName: string;
  assigneeImage?: string | null;
}

function deductionReasonLabel(reason: string): string {
  if (reason === REWARD_DEDUCTION_REASON.LATE) {
    return t`Trễ hạn (hoàn thành sau deadline)`;
  }
  if (reason === REWARD_DEDUCTION_REASON.MOVE) {
    return t`Dời deadline`;
  }
  return reason;
}

interface CardRewardSummaryCardProps {
  data: {
    rewardType: "project" | "responsibility";
    bonusAmount: string | number | null;
    currency: string;
    approvalStatus: RewardStatus;
    rejectedReason?: string | null;
    approvedBy?: { name: string | null };
    approvedAt?: Date | string | null;
    deductions?: { reason: string; value: string | number; unitType: string }[];
    snapshot?: CardSnapshot | null;
    violationLogs?: RewardViolationLog[];
    finalization?: {
      completionPercent: string;
      finalAmount: string;
      finalNote?: string | null;
    } | null;
  };
  card: {
    cardTitle: string;
    startDate?: Date | null;
    dueDate?: Date | null;
    assignee?: {
      name: string;
      image?: string | null;
      email?: string | null;
    } | null;
    targetUser?: string | null;
  };
  isAdmin?: boolean;
  onEdit: () => void;
  onWithdraw?: () => void;
  onRevert?: () => void;
}

export const CardRewardSummaryCard = ({
  data,
  card,
  isAdmin,
  onEdit,
  onWithdraw,
  onRevert,
}: CardRewardSummaryCardProps) => {
  const statusConfig = {
    draft: {
      label: t`Bản nháp`,
      colorClass: "bg-neutral-100 text-neutral-600 border-neutral-200",
      dotClass: "bg-neutral-400",
    },
    waiting_approval: {
      label: t`Chờ duyệt`,
      colorClass: "bg-amber-100/50 text-amber-700 border-amber-200",
      dotClass: "bg-amber-500",
    },
    approved: {
      label: t`ĐÃ DUYỆT`,
      colorClass: "bg-emerald-100/50 text-emerald-700 border-emerald-200",
      dotClass: "bg-emerald-500",
    },
    rejected: {
      label: t`REJECTED`,
      colorClass: "bg-rose-100 text-rose-600 border-rose-200",
      dotClass: "bg-rose-500",
    },
    waiting_evaluation: {
      label: t`Chờ đánh giá`,
      colorClass: "bg-blue-100/50 text-blue-700 border-blue-200",
      dotClass: "bg-blue-500",
    },
    completed: {
      label: t`Đã tất toán`,
      colorClass: "bg-indigo-100 text-indigo-700 border-indigo-200",
      dotClass: "bg-indigo-500",
    },
  };

  const currentStatus = statusConfig[data.approvalStatus];

  const mismatches = React.useMemo(() => {
    return detectRewardMismatch(
      {
        title: card.cardTitle,
        startDate: card.startDate,
        dueDate: card.dueDate,
        assigneeId: card.targetUser,
        bonusAmount: data.bonusAmount,
        currency: data.currency,
        deductions: data.deductions,
      },
      data.snapshot || null,
    );
  }, [data, card]);

  const formatNumber = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === "") return "0";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "0";
    return num.toLocaleString("vi-VN");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-5 p-1"
    >
      {/* Header Status */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-widest text-neutral-800">
          {t`Cấu hình thưởng / Khấu trừ`} —{" "}
          <span
            className={
              currentStatus.colorClass +
              " inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px]"
            }
          >
            {data.approvalStatus === "completed" && (
              <HiCheck className="h-3 w-3" />
            )}
            {currentStatus.label}
          </span>
        </h3>
      </div>

      {data.approvalStatus === "rejected" && data.rejectedReason && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 dark:border-rose-900/40 dark:bg-rose-950/30">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">
            {t`Lý do từ chối`}
          </p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-rose-900 dark:text-rose-100">
            {data.rejectedReason}
          </p>
        </div>
      )}

      {/* Snapshot Information + khấu trừ (cùng khung) */}
      {data.snapshot && (
        <div className="rounded-xl border border-neutral-200 bg-[#f9f9f5] p-5 dark:border-dark-300 dark:bg-dark-200/30">
          <span className="mb-4 block text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
            {t`Snapshot (chốt lúc duyệt)`}
          </span>
          <div className="flex flex-col gap-2.5 pl-2 text-[13px]">
            <div className="flex items-center gap-3">
              <span className="text-sm">📅</span>
              <p className="font-semibold text-neutral-700 dark:text-dark-800">
                {data.snapshot.snappedStartDate
                  ? format(new Date(data.snapshot.snappedStartDate), "MMM d")
                  : "?"}{" "}
                →{" "}
                {data.snapshot.snappedDueDate
                  ? format(
                      new Date(data.snapshot.snappedDueDate),
                      "MMM d, yyyy",
                    )
                  : "?"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-400 opacity-70">👤</span>
              <p className="font-semibold text-neutral-700 dark:text-dark-800">
                {data.snapshot.assigneeName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm">💰</span>
              <p className="font-black text-neutral-800 dark:text-dark-1000">
                {formatNumber(data.snapshot.snappedBonusAmount)}{" "}
                {data.snapshot.snappedCurrency}
              </p>
            </div>
          </div>

          {data.deductions && data.deductions.length > 0 && (
            <>
              <div className="my-4 border-t border-neutral-200/90 dark:border-dark-400/50" />
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
                {t`Danh sách Khấu trừ (chỉ đọc)`}
              </p>
              <div className="overflow-hidden rounded-lg border border-neutral-200/90 bg-white/60 dark:border-dark-300 dark:bg-dark-100/40">
                <table className="w-full text-[12px]">
                  <thead className="bg-neutral-50/80 font-bold uppercase tracking-tighter text-neutral-400 dark:bg-dark-200/80 dark:text-dark-600">
                    <tr>
                      <th className="border-b border-neutral-100 px-3 py-2.5 dark:border-dark-300">
                        {t`Lý do`}
                      </th>
                      <th className="border-b border-neutral-100 px-3 py-2.5 text-center dark:border-dark-300">
                        {t`Loại`}
                      </th>
                      <th className="border-b border-neutral-100 px-3 py-2.5 text-right dark:border-dark-300">
                        {t`Giá trị`}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700 dark:divide-dark-300 dark:text-dark-800">
                    {data.deductions.map((d, i) => (
                      <tr key={i}>
                        <td className="px-3 py-3">
                          {deductionReasonLabel(d.reason)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.unitType === "percent" ? "%" : "VND"}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-rose-500 dark:text-rose-400">
                          {formatNumber(d.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Finalization Results Section (Step 4) */}
      {data.approvalStatus === "completed" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl bg-emerald-600 p-6 text-white shadow-lg shadow-emerald-200"
        >
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex items-center justify-between opacity-80">
              <span className="text-[10px] font-black uppercase tracking-widest">{t`Kết quả nghiệm thu`}</span>
              <HiClipboardDocumentCheck className="h-5 w-5" />
            </div>

            <div className="grid grid-cols-2 gap-4 border-y border-white/10 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase opacity-60">{t`Hoàn thành`}</p>
                <p className="text-xl font-black">
                  {data.finalization?.completionPercent || "100"}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase opacity-60">{t`Số tiền thực nhận`}</p>
                <p className="text-xl font-black">
                  {formatNumber(
                    data.finalization?.finalAmount || data.bonusAmount,
                  )}{" "}
                  {data.currency}
                </p>
              </div>
            </div>

            {data.finalization?.finalNote && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase opacity-60">{t`Ghi chú`}</span>
                <p className="text-xs font-medium italic">
                  "{data.finalization.finalNote}"
                </p>
              </div>
            )}

            {!data.finalization && (
              <p className="text-[10px] font-medium italic opacity-60">
                {t`* Chi tiết tất toán chưa được đồng bộ từ server`}
              </p>
            )}
          </div>

          {/* Abstract background shape */}
          <div className="absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        </motion.div>
      )}

      {/* Current State Comparison (Step 1/2) */}
      <div className="space-y-4 px-1">
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
            {t`Hiện tại (Card gốc)`}
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 text-[13px] font-bold text-neutral-700">
              <span className="text-sm">📅</span>
              {card.startDate && card.dueDate ? (
                <div className="flex items-center gap-2">
                  <span>
                    {format(new Date(card.startDate), "MMM d")} -{" "}
                    {format(new Date(card.dueDate), "MMM d, yyyy")}
                  </span>
                  {mismatches.deadline && (mismatches.diffDays ?? 0) > 0 && (
                    <span className="flex items-center gap-1 rounded border border-rose-100 bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                      {t`dời +${mismatches.diffDays ?? 0} ngày`}
                    </span>
                  )}
                </div>
              ) : (
                t`Chưa đặt timeline`
              )}
            </div>
            <div className="flex items-center gap-3 text-[13px] font-bold text-neutral-700">
              <span className="text-sm opacity-70">👤</span>
              {card.assignee?.name || t`Chưa phân công`}
            </div>
            {data.rewardType === "project" && (
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-neutral-700">
                <span className="text-sm">💰</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-emerald-700">
                    {formatNumber(data.bonusAmount)} {data.currency}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    {t`(đề xuất)`}
                  </span>
                  {!!data.snapshot && mismatches.amount && (
                    <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-tight text-amber-800">
                      {t`Khác snapshot`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Draft hoặc chờ duyệt: có snapshot và lệch so với đề xuất hiện tại */}
        {mismatches.hasMismatch &&
          (data.approvalStatus === "draft" ||
            data.approvalStatus === "waiting_approval") &&
          !!data.snapshot && (
            <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4">
              <HiExclamationCircle className="h-5 w-5 shrink-0 text-rose-500" />
              <p className="text-xs font-bold leading-relaxed text-rose-700">
                {t`Dữ liệu đã thay đổi so với bản gốc được duyệt. Cần Admin xem xét lại.`}
              </p>
            </div>
          )}

        {/* LOGS Section */}
        {data.violationLogs && data.violationLogs.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              ┌ {t`Lịch sử Vi phạm (Logs)`}
            </p>
            <div className="ml-2 space-y-2 border-l-2 border-rose-100 py-1 pl-4">
              {data.violationLogs.map((log, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(244,63,94,0.3)]" />
                  <span className="font-bold text-neutral-400">
                    {format(new Date(log.date), "MMM d")}
                  </span>
                  <span className="font-semibold text-neutral-600">
                    • {log.reason}
                  </span>
                  {log.isSkipped ? (
                    <span className="font-bold text-neutral-400">
                      ({t`Bỏ qua khấu trừ`})
                    </span>
                  ) : log.deductionUnit === "percent" ? (
                    <span className="font-black text-rose-600">
                      → −{formatNumber(log.deductionValue)}%
                    </span>
                  ) : (
                    <span className="font-black text-rose-600">
                      → −{formatNumber(log.deductionValue)}đ
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Khấu trừ khi chưa có snapshot (nháp) — cùng kiểu khung với snapshot */}
        {!data.snapshot && data.deductions && data.deductions.length > 0 && (
          <div className="mt-2 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
              {t`Danh sách Khấu trừ (chỉ đọc)`}
            </p>
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-[#f9f9f5] dark:border-dark-300 dark:bg-dark-200/30">
              <table className="w-full text-[12px]">
                <thead className="bg-neutral-50/80 font-bold uppercase tracking-tighter text-neutral-400 dark:bg-dark-200/80 dark:text-dark-600">
                  <tr>
                    <th className="border-b border-neutral-100 px-3 py-3 dark:border-dark-300">
                      {t`Lý do`}
                    </th>
                    <th className="border-b border-neutral-100 px-3 py-3 text-center dark:border-dark-300">
                      {t`Loại`}
                    </th>
                    <th className="border-b border-neutral-100 px-3 py-3 text-right dark:border-dark-300">
                      {t`Giá trị`}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700 dark:divide-dark-300 dark:text-dark-800">
                  {data.deductions.map((d, i) => (
                    <tr key={i}>
                      <td className="px-3 py-4">
                        {deductionReasonLabel(d.reason)}
                      </td>
                      <td className="px-3 py-4 text-center">
                        {d.unitType === "percent" ? "%" : "VND"}
                      </td>
                      <td className="px-3 py-4 text-right font-bold text-rose-500 dark:text-rose-400">
                        {formatNumber(d.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer: Approved Info */}
        {data.approvalStatus === "approved" && (
          <div className="flex items-center gap-2 border-t border-neutral-50 px-1 pt-6 text-[10px] font-bold text-neutral-400">
            <HiCheckCircle className="h-4 w-4 text-emerald-500" />
            {t`Duyệt bởi`}:{" "}
            <span className="text-neutral-800">
              {data.approvedBy?.name || t`Admin`}
            </span>
            <span className="opacity-50">•</span>
            <span>
              {data.approvedAt && !isNaN(new Date(data.approvedAt).getTime())
                ? format(new Date(data.approvedAt), "MMM dd, yyyy")
                : ""}
            </span>
          </div>
        )}

        {/* User Actions (Withdraw/Edit/Revert) */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          {data.approvalStatus === "waiting_approval" && (
            <button
              type="button"
              onClick={onWithdraw}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-8 text-xs font-bold text-neutral-700 shadow-sm transition-all hover:bg-neutral-50"
            >
              <HiClock className="h-4 w-4" />
              {t`Thu hồi về Draft`}
            </button>
          )}

          {data.approvalStatus === "draft" && !!data.snapshot && onRevert && (
            <button
              type="button"
              onClick={onRevert}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-6 text-xs font-bold text-amber-900 shadow-sm transition-all hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            >
              {t`Khôi phục theo snapshot đã duyệt`}
            </button>
          )}

          {(data.approvalStatus === "draft" ||
            data.approvalStatus === "rejected") && (
            <button
              type="button"
              onClick={onEdit}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-neutral-900 bg-neutral-900 px-8 text-xs font-bold text-white shadow-sm transition-all hover:bg-neutral-800"
            >
              <HiPencilSquare className="h-4 w-4" />
              {data.approvalStatus === "rejected"
                ? isAdmin
                  ? t`Chỉnh sửa & Gửi lại`
                  : t`Sửa & Gửi lại`
                : isAdmin
                  ? t`Chỉnh sửa cấu hình`
                  : t`Gửi phê duyệt`}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
