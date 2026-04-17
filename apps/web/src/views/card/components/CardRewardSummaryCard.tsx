import { t } from "@lingui/macro";
import { format } from "date-fns";
import { motion } from "framer-motion";
import React from "react";
import {
  HiCalendarDays,
  HiCheckCircle,
  HiClock,
  HiExclamationCircle,
  HiPencilSquare,
  HiUser,
} from "react-icons/hi2";

import Avatar from "~/components/Avatar";

export type RewardStatus =
  | "draft"
  | "waiting_approval"
  | "approved"
  | "rejected";

interface RewardViolationLog {
  date: string;
  reason: string;
  deductionValue: number;
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
  onEdit: () => void;
  onWithdraw?: () => void;
}

export const CardRewardSummaryCard = ({
  data,
  card,
  onEdit,
  onWithdraw,
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
      label: t`Đã duyệt`,
      colorClass: "bg-emerald-100/50 text-emerald-700 border-emerald-200",
      dotClass: "bg-emerald-500",
    },
    rejected: {
      label: t`REJECTED`,
      colorClass: "bg-rose-100 text-rose-600 border-rose-200",
      dotClass: "bg-rose-500",
    },
  };

  const currentStatus = statusConfig[data.approvalStatus];

  const mismatches = React.useMemo(() => {
    if (data.approvalStatus !== "approved" || !data.snapshot) return { hasMismatch: false, title: false, deadline: false, assignee: false, amount: false, deductions: false };
    
    const snap = data.snapshot;
    const title = card.cardTitle !== snap.snappedCardTitle;
    
    const d1 = card.startDate ? new Date(card.startDate).getTime() : null;
    const d2 = snap.snappedStartDate ? new Date(snap.snappedStartDate).getTime() : null;
    
    const d3 = card.dueDate ? new Date(card.dueDate).getTime() : null;
    const d4 = snap.snappedDueDate ? new Date(snap.snappedDueDate).getTime() : null;
    const deadline = d1 !== d2 || d3 !== d4;

    const assignee = (card.targetUser || "") !== (snap.snappedTargetUser || "");

    const amt = Number(data.bonusAmount) !== Number(snap.snappedBonusAmount) || data.currency !== snap.snappedCurrency;

    let deducs = false;
    const sD = snap.snappedDeductions || [];
    const cD = data.deductions || [];
    if (sD.length !== cD.length) deducs = true;
    else {
      for(let i = 0; i < sD.length; i++) {
        const sItem = sD[i]!;
        const cItem = cD[i]!;
        if (sItem.reason !== cItem.reason || Number(sItem.value) !== Number(cItem.value) || sItem.unitType !== cItem.unitType) {
          deducs = true;
          break;
        }
      }
    }

    return {
      hasMismatch: title || deadline || assignee || amt || deducs,
      title, deadline, assignee, amount: amt, deductions: deducs
    };
  }, [data, card]);

  const formatNumber = (val: string | number | null | undefined) => {
    if (val === null || val === undefined || val === "") return "0";
    const num = typeof val === "string" ? parseFloat(val) : val;
    if (isNaN(num)) return "0";
    return num.toLocaleString("vi-VN");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-5"
    >
      <div className="shrink-0 space-y-5">
        <div className="flex items-center justify-between border-b border-light-200 pb-3 dark:border-dark-300">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-black uppercase tracking-tight ${mismatches.title ? "text-rose-500" : "text-neutral-900 dark:text-dark-1000"}`}>
              {card.cardTitle}
            </p>
            <span
              className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${currentStatus.colorClass}`}
            >
              {currentStatus.label}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-light-100 bg-light-50/50 p-4 dark:border-dark-300/50 dark:bg-dark-200/30">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              <HiCalendarDays className="h-3.5 w-3.5" />
              {t`Thời gian`}
            </p>
            <div className={`text-xs font-bold ${mismatches.deadline ? "text-rose-500 dark:text-rose-400" : "text-neutral-700 dark:text-dark-900"}`}>
              {card.startDate && card.dueDate ? (
                <span>
                  {format(new Date(card.startDate), "dd/MM")} -{" "}
                  {format(new Date(card.dueDate), "dd/MM/yyyy")}
                </span>
              ) : (
                <span className="italic text-neutral-400">{t`Chưa đặt timeline`}</span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-light-100 bg-light-50/50 p-4 dark:border-dark-300/50 dark:bg-dark-200/30">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              <HiUser className="h-3.5 w-3.5" />
              {t`Người thực hiện`}
            </p>
            <div className="flex items-center gap-2">
              <Avatar
                imageUrl={card.assignee?.image || undefined}
                name={card.assignee?.name || ""}
                email={card.assignee?.email || ""}
                size="xs"
              />
              <span className={`text-xs font-black ${mismatches.assignee ? "text-rose-500 dark:text-rose-400" : "text-neutral-700 dark:text-dark-900"}`}>
                {card.assignee?.name || t`Chưa phân công`}
              </span>
            </div>
          </div>
        </div>

        {/* Mismatch Warning Box */}
        {data.approvalStatus === "approved" && data.snapshot && mismatches.hasMismatch && (
          <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
              <HiExclamationCircle className="h-4 w-4" />
            </div>
            <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
              {t`Dữ liệu đã thay đổi so với bản gốc được duyệt`}
            </p>
          </div>
        )}

        {/* Pending Info Box */}
        {data.approvalStatus === "waiting_approval" && (
          <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
              <HiClock className="h-3.5 w-3.5" />
            </div>
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
              {t`Đang chờ Admin xét duyệt...`}
            </p>
          </div>
        )}

        {data.approvalStatus === "rejected" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm dark:border-rose-900/30 dark:bg-dark-200/50"
          >
            <div className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                <HiExclamationCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1.5 pt-0.5">
                <p className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
                  {t`Lý do từ chối (Admin)`}
                </p>
                <div className="text-sm font-medium italic text-neutral-600 dark:text-dark-700">
                  "{data.rejectedReason || t`Số tiền thưởng chưa phù hợp.`}"
                </div>
                <div className="pt-2 text-[11px] font-bold text-neutral-400">
                  — {data.approvedBy?.name || "Nguyễn Admin"} •{" "}
                  {data.approvedAt
                    ? format(new Date(data.approvedAt), "MMM dd, yyyy")
                    : "Apr 14, 2026"}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {data.approvalStatus === "approved" && data.snapshot && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm dark:border-emerald-900/20 dark:bg-dark-200/50">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                {t`Snapshot (chốt lúc duyệt)`}
              </p>
              <div className="ml-2 space-y-2 border-l-2 border-emerald-100 pl-4 transition-all dark:border-emerald-900/30">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-dark-700">
                  <HiCalendarDays className="h-3.5 w-3.5 opacity-50" />
                  {data.snapshot.snappedStartDate &&
                  data.snapshot.snappedDueDate ? (
                    <span>
                      {format(
                        new Date(data.snapshot.snappedStartDate),
                        "dd/MM",
                      )}{" "}
                      -{" "}
                      {format(
                        new Date(data.snapshot.snappedDueDate),
                        "dd/MM/yyyy",
                      )}
                    </span>
                  ) : (
                    <span className="italic text-neutral-400">{t`Chưa đặt timeline`}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-dark-700">
                  <Avatar
                    imageUrl={data.snapshot.assigneeImage || undefined}
                    name={data.snapshot.assigneeName}
                    email=""
                    size="xs"
                  />
                  {data.snapshot.assigneeName}
                </div>
                <div className="flex items-center gap-2 text-xs font-black text-neutral-800 dark:text-dark-1000">
                  <span className="text-sm">💰</span>
                  {formatNumber(data.snapshot.snappedBonusAmount)}{" "}
                  {data.snapshot.snappedCurrency}
                </div>
              </div>
            </div>

            {/* Current State Comparison */}
            <div className="space-y-3 px-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                {t`Hiện tại (Card gốc)`}
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-dark-900">
                  <HiCalendarDays className="h-4 w-4 text-neutral-400" />
                  {card.startDate && card.dueDate ? (
                    <>
                      {format(new Date(card.startDate), "dd/MM")} -{" "}
                      {format(new Date(card.dueDate), "dd/MM/yyyy")}
                      {(() => {
                        const snapDue = data.snapshot.snappedDueDate;
                        if (!snapDue) return null;
                        const snapDueMs = new Date(snapDue).getTime();
                        const cardDueMs = new Date(card.dueDate).getTime();
                        if (cardDueMs <= snapDueMs) return null;
                        return (
                          <span className="flex items-center gap-1 rounded bg-rose-100 px-1 py-0.5 text-[9px] font-black text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                            {t`dời +${Math.round((cardDueMs - snapDueMs) / (1000 * 3600 * 24))} ngày`}
                          </span>
                        );
                      })()}
                    </>
                  ) : (
                    t`Chưa đặt timeline`
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-700 dark:text-dark-900">
                  <Avatar
                    imageUrl={card.assignee?.image || undefined}
                    name={card.assignee?.name || ""}
                    email={card.assignee?.email || ""}
                    size="xs"
                  />
                  {card.assignee?.name || t`Chưa phân công`}
                </div>
              </div>
            </div>

            {/* Violation Logs */}
            {data.violationLogs && data.violationLogs.length > 0 && (
              <div className="space-y-3 px-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                  ┌ {t`Lịch sử Vi phạm (Logs)`}
                </p>
                <div className="ml-2 space-y-2.5 border-l-2 border-rose-100 pl-4 dark:border-rose-900/20">
                  {data.violationLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      <div className="space-y-0.5">
                        <span className="font-bold text-neutral-400">
                          {format(new Date(log.date), "MMM dd")} •
                        </span>{" "}
                        <span className="font-semibold text-neutral-600 dark:text-dark-700">
                          {log.reason}
                        </span>{" "}
                        <span className="font-black text-rose-500">
                          -{formatNumber(log.deductionValue)}đ
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details Wrapper */}
        <div className="space-y-6 rounded-2xl border border-light-200 bg-white/50 p-6 dark:border-dark-300 dark:bg-dark-100/50">
          <div className="space-y-2">
            <div className="text-sm font-medium text-neutral-500">
              {t`Loại`}:{" "}
              <span className="font-bold text-neutral-800 dark:text-dark-1000">
                {data.rewardType === "project"
                  ? t`Thưởng Dự án (Project)`
                  : t`Thưởng Trách nhiệm (Responsibility)`}
              </span>{" "}
              {(data.approvalStatus === "waiting_approval" ||
                data.approvalStatus === "approved") && (
                <span className="ml-1 text-[10px] italic text-neutral-400"></span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-neutral-500">
              <span className="text-lg">💰</span> {t`Số tiền thưởng`}:{" "}
              <p className="text-lg font-black tracking-tight text-neutral-900 dark:text-dark-1000">
                {formatNumber(data.bonusAmount)} {data.currency}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
              {t`Danh sách Khấu trừ`}{" "}
              {(data.approvalStatus === "waiting_approval" ||
                data.approvalStatus === "approved") && (
                <span className="ml-1 normal-case italic text-neutral-400"></span>
              )}
            </p>
            <div className="overflow-hidden rounded-xl border border-light-200 dark:border-dark-300">
              <table className="w-full text-left text-xs">
                <thead className="bg-light-100 font-bold text-neutral-500 dark:bg-dark-200">
                  <tr>
                    <th className="px-3 py-2">{t`Lý do`}</th>
                    <th className="border-l border-light-200 px-3 py-2 dark:border-dark-300">
                      {t`Loại`}
                    </th>
                    <th className="border-l border-light-200 px-3 py-2 dark:border-dark-300">
                      {t`Giá trị`}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-100 dark:divide-dark-300">
                  {data.deductions && data.deductions.length > 0 ? (
                    data.deductions.map((d, i) => (
                      <tr
                        key={i}
                        className="font-semibold text-neutral-700 dark:text-dark-800"
                      >
                        <td className="px-3 py-2.5">{d.reason}</td>
                        <td className="border-l border-light-200 px-3 py-2.5 dark:border-dark-300">
                          {d.unitType === "percent" ? "%" : "VND"}
                        </td>
                        <td className="border-l border-light-200 px-3 py-2.5 font-bold text-rose-500 dark:border-dark-300">
                          {formatNumber(d.value)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-3 py-4 text-center italic text-neutral-400"
                      >
                        {t`(Chưa có mục)`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex flex-row items-center justify-center gap-3 pt-2">
            {data.approvalStatus === "waiting_approval" && (
              <button
                onClick={onWithdraw}
                className="flex items-center gap-2 rounded-xl border border-light-200 bg-white px-6 py-2 text-xs font-bold text-neutral-600 transition-all hover:bg-light-50 hover:text-rose-500 dark:border-dark-300 dark:bg-dark-200 dark:hover:bg-dark-300"
              >
                <HiClock className="h-4 w-4" />
                {t`Thu hồi về Draft`}
              </button>
            )}

            <button
              onClick={onEdit}
              className="flex items-center gap-2 rounded-xl bg-neutral-900 px-6 py-2 text-xs font-bold text-white transition-all hover:bg-neutral-800 dark:bg-dark-400 dark:hover:bg-dark-500"
            >
              <HiPencilSquare className="h-4 w-4" />
              {data.approvalStatus === "rejected"
                ? t`Chỉnh sửa & Gửi lại`
                : t`Chỉnh sửa`}
            </button>
          </div>

          {/* Footer for Approved State */}
          {data.approvalStatus === "approved" && (
            <div className="flex items-center justify-center gap-2 pt-2 text-[11px] font-bold text-neutral-400">
              <HiCheckCircle className="h-4 w-4 text-emerald-500" />
              {t`Duyệt bởi`}:{" "}
              <span className="text-neutral-700 dark:text-dark-900">
                {data.approvedBy?.name || t`Admin`}
              </span>
              <span>•</span>
              <span>
                {data.approvedAt
                  ? format(new Date(data.approvedAt), "MMM dd, yyyy")
                  : ""}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
