import { t } from "@lingui/macro";
import { format } from "date-fns";
import { motion } from "framer-motion";
import React, { useMemo, useState } from "react";
import {
  HiCheck,
  HiClipboardDocumentCheck,
  HiCurrencyDollar,
  HiInformationCircle,
} from "react-icons/hi2";

import { totalDeductionVndFromApprovedLogs } from "~/utils/reward";
import { RewardStatus } from "./CardRewardSummaryCard";

interface CardSnapshot {
  snappedCardTitle: string;
  snappedStartDate: string | Date | null;
  snappedDueDate: string | Date | null;
  snappedTargetUser: string | null;
  snappedRewardType: string;
  snappedBonusAmount: string | number | null;
  snappedCurrency: string;
  snappedDeductions: any[];
}

export interface RewardLogRow {
  violationType: string;
  isSkipped: boolean;
  detectedAt?: Date | string;
  deduction?: {
    unitType: "percent" | "vnd";
    value: string;
  } | null;
}

interface CardRewardFinalizeProps {
  data: {
    id: number;
    rewardType: "project" | "responsibility";
    bonusAmount: string | number | null;
    currency: string;
    approvalStatus: RewardStatus;
    snapshot: CardSnapshot | null;
    logs?: RewardLogRow[];
  };
  onFinalize: (percent: number, note: string) => Promise<void>;
  onBack: () => void;
}

function violationLabel(type: string): string {
  const labels: Record<string, string> = {
    deadline_extended: t`Dời deadline / timeline`,
    deduction_changed: t`Trễ hạn (hoàn thành sau deadline)`,
    completed_after_deadline: t`Trễ hạn (hoàn thành sau deadline)`,
    reward_config_changed: t`Thay đổi cấu hình`,
    finalization_created: t`Nghiệm thu`,
  };
  return labels[type] || type;
}

export const CardRewardFinalize = ({
  data,
  onFinalize,
  onBack,
}: CardRewardFinalizeProps) => {
  const [percent, setPercent] = useState<number>(100);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const baseBonus = Number(data.snapshot?.snappedBonusAmount || 0);
  const currency = data.snapshot?.snappedCurrency || "VND";

  const penaltyLogs = useMemo(
    () =>
      (data.logs ?? []).filter(
        (l) =>
          l.violationType !== "finalization_created" &&
          !l.isSkipped &&
          l.deduction,
      ),
    [data.logs],
  );

  const totalDeductionVnd = useMemo(
    () => totalDeductionVndFromApprovedLogs(data.logs ?? [], baseBonus),
    [data.logs, baseBonus],
  );

  const grossAfterPercent = baseBonus * (percent / 100);
  const suggestedAmount = Math.max(0, grossAfterPercent - totalDeductionVnd);

  const formatCurrency = (val: number) => {
    return Math.round(val).toLocaleString("vi-VN");
  };

  const handleFinalizeAction = async () => {
    setIsSubmitting(true);
    try {
      await onFinalize(percent, note);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col gap-5 p-1 pb-10"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
            {t`NGHIỆM THU & TẤT TOÁN`}
          </p>
          <p className="mt-1 text-[10px] font-medium leading-snug text-neutral-500 dark:text-dark-600">
            {t`Chốt tỷ lệ hoàn thành và tính toán thưởng thực nhận`}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-blue-200 bg-blue-100/50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-300">
          {t`Chờ nghiệm thu`}
        </span>
      </div>

      {penaltyLogs.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/25">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300">
            {t`Lịch sử vi phạm (đã duyệt, sẽ khấu trừ)`}
          </p>
          <ul className="space-y-2 text-[11px] font-medium text-neutral-700">
            {penaltyLogs.map((l, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-2">
                <span className="text-neutral-400">
                  {l.detectedAt
                    ? format(
                        typeof l.detectedAt === "string"
                          ? new Date(l.detectedAt)
                          : l.detectedAt,
                        "dd/MM/yyyy",
                      )
                    : "—"}
                </span>
                <span className="font-semibold">
                  {violationLabel(l.violationType)}
                </span>
                {l.deduction && (
                  <span className="font-bold text-rose-600">
                    −
                    {l.deduction.unitType === "vnd"
                      ? `${formatCurrency(Number(l.deduction.value))}đ`
                      : `${l.deduction.value}% (${t`trên thưởng gốc`})`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-light-200 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-dark-300 dark:bg-dark-100/70">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
              <HiClipboardDocumentCheck className="h-5 w-5" />
            </div>
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
              {t`Tỷ lệ hoàn thành`}
            </label>
          </div>

          <div className="mt-1 space-y-4">
            <div className="flex items-end gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="w-24 rounded-xl border border-light-200 bg-white p-4 text-center text-2xl font-black text-neutral-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-500/15 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-1000"
              />
              <span className="mb-4 text-xl font-black text-neutral-300 dark:text-dark-500">
                %
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-light-100 accent-orange-500 dark:bg-dark-300"
            />

            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPercent(p)}
                  className={`rounded-lg py-2 text-[10px] font-bold transition-all ${
                    percent === p
                      ? "bg-orange-500 text-white shadow-sm dark:bg-orange-600"
                      : "border border-light-200 bg-light-50 text-neutral-500 hover:bg-light-100 dark:border-dark-300 dark:bg-dark-200 dark:text-dark-600 dark:hover:bg-dark-300"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-light-200 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-dark-300 dark:bg-dark-100/70">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
            {t`Ghi chú nghiệm thu`}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t`Nhập nhận xét về kết quả công việc...`}
            className="min-h-[140px] flex-1 rounded-xl border border-light-200 bg-white p-4 text-sm font-medium text-neutral-800 placeholder:text-neutral-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-500/10 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-1000 dark:placeholder:text-dark-600"
          />
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-600 p-6 text-white shadow-lg shadow-emerald-200/80 dark:border-emerald-800/50 dark:shadow-emerald-950/40">
        <div className="relative z-10 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-white/15 pb-3 opacity-90">
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {t`Thưởng gốc (snapshot)`}
            </span>
            <span className="font-mono text-sm tabular-nums leading-none">
              {formatCurrency(baseBonus)} {currency}
            </span>
          </div>

          <div className="flex items-center justify-between text-white/90">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
              {t`Hoàn thành`}
            </span>
            <span className="font-mono text-sm tabular-nums leading-none">
              × {percent}%
            </span>
          </div>

          <div className="flex items-center justify-between text-rose-100">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-90">
              {t`Tổng khấu trừ (đã duyệt, quy đổi VND)`}
            </span>
            <span className="font-mono text-sm tabular-nums leading-none">
              − {formatCurrency(totalDeductionVnd)} đ
            </span>
          </div>

          <div className="my-1 h-px w-full bg-white/15" />

          <div className="flex items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">
                {t`Thanh toán đề xuất`}
              </span>
              <p className="text-3xl font-black tabular-nums leading-none tracking-tight">
                {formatCurrency(suggestedAmount)}
                <span className="ml-2 text-sm font-medium text-white/60">
                  {currency}
                </span>
              </p>
              <span className="text-[10px] font-medium text-emerald-100/80">
                {t`Công thức`}: ({t`Thưởng gốc`} × {percent}%) − {t`tổng phạt`}
              </span>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-emerald-100">
              <HiCurrencyDollar className="h-8 w-8" />
            </div>
          </div>

          <div className="mt-1 flex items-start gap-2 rounded-xl bg-white/10 p-3 text-[11px] font-medium leading-relaxed text-white/85">
            <HiInformationCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <p>
              {t`Số tiền trên là gợi ý trùng với hệ thống khi bạn bấm Chốt nghiệm thu.`}
            </p>
          </div>
        </div>

        <div className="absolute -bottom-10 -right-10 h-36 w-36 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 items-center justify-center rounded-xl border border-light-200 bg-white text-[13px] font-bold text-neutral-500 transition-all hover:bg-light-50 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-600 dark:hover:bg-dark-200"
        >
          {t`Quay lại`}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleFinalizeAction}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-black text-white shadow-md shadow-emerald-600/25 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-30 dark:shadow-emerald-950/50"
        >
          <HiCheck className="h-5 w-5" />
          {t`CHỐT NGHIỆM THU`}
        </button>
      </div>
    </motion.div>
  );
};
