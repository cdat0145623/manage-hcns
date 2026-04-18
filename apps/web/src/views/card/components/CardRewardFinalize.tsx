import { t } from "@lingui/macro";
import { motion } from "framer-motion";
import React, { useState } from "react";
import {
  HiCheck,
  HiCurrencyDollar,
  HiClipboardDocumentCheck,
  HiInformationCircle,
} from "react-icons/hi2";

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

interface CardRewardFinalizeProps {
  data: {
    id: number;
    rewardType: "project" | "responsibility";
    bonusAmount: string | number | null;
    currency: string;
    approvalStatus: RewardStatus;
    snapshot: CardSnapshot | null;
  };
  onFinalize: (percent: number, note: string) => Promise<void>;
  onBack: () => void;
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

  const suggestedAmount = baseBonus * (percent / 100);

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
      className="flex flex-col gap-6 p-1 pb-10"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-800">
            {t`NGHIỆM THU & TẤT TOÁN`}
          </h3>
          <p className="mt-1 text-[10px] font-medium text-neutral-400">
            {t`Chốt tỷ lệ hoàn thành và tính toán thưởng thực nhận`}
          </p>
        </div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-bold text-blue-600">
          {t`Phase 4: Finalization`}
        </div>
      </div>

      {/* Inputs Section */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Completion Percent */}
        <div className="flex flex-col gap-4 rounded-3xl border border-neutral-100 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <HiClipboardDocumentCheck className="h-5 w-5" />
            </div>
            <label className="text-xs font-black uppercase tracking-widest text-neutral-800">
              {t`Tỷ lệ hoàn thành`}
            </label>
          </div>

          <div className="mt-2 space-y-4">
            <div className="flex items-end gap-2">
              <input
                type="number"
                min="0"
                max="100"
                value={percent}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="w-24 rounded-2xl bg-neutral-100 p-4 text-center text-2xl font-black text-neutral-900 outline-none focus:ring-4 focus:ring-orange-500/10"
              />
              <span className="mb-4 text-xl font-black text-neutral-300">%</span>
            </div>
            
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-neutral-100 accent-orange-500"
            />
            
            <div className="grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setPercent(p)}
                  className={`rounded-lg py-2 text-[10px] font-bold transition-all ${
                    percent === p
                      ? "bg-orange-500 text-white"
                      : "bg-neutral-50 text-neutral-400 hover:bg-neutral-100"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Note Section */}
        <div className="flex flex-col gap-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            {t`Ghi chú nghiệm thu`}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t`Nhập nhận xét về kết quả công việc...`}
            className="flex-1 rounded-3xl border border-neutral-100 bg-neutral-50/30 p-4 text-sm font-medium placeholder:text-neutral-300 focus:border-blue-300 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Calculation Summary */}
      <div className="relative overflow-hidden rounded-3xl bg-neutral-900 p-8 text-white shadow-xl shadow-neutral-900/20">
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-center justify-between opacity-60">
            <span className="text-xs font-bold uppercase tracking-widest">{t`Thưởng gốc (Approved)`}</span>
            <span className="font-mono text-sm leading-none tabular-nums">
              {formatCurrency(baseBonus)} {currency}
            </span>
          </div>

          <div className="flex items-center justify-between text-orange-400">
            <span className="text-xs font-bold uppercase tracking-widest">{t`Hoàn thành thực tế`}</span>
            <span className="font-mono text-sm leading-none tabular-nums">
              x {percent}%
            </span>
          </div>

          <div className="my-2 h-[1px] w-full bg-white/10" />

          <div className="flex items-end justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-black uppercase tracking-[2px] text-emerald-400">
                {t`Thanh toán đề xuất`}
              </span>
              <p className="text-3xl font-black tracking-tight tabular-nums leading-none">
                {formatCurrency(suggestedAmount)}
                <span className="ml-2 text-sm font-medium opacity-40">{currency}</span>
              </p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-emerald-400">
              <HiCurrencyDollar className="h-8 w-8" />
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white/5 p-4 text-[11px] font-medium leading-relaxed text-neutral-400">
            <HiInformationCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
            <p>
              {t`Lưu ý: Các khoản phạt vi phạm (nếu có) sẽ được hệ thống tự động khấu trừ vào số tiền này khi bạn nhấn nút Chốt Nghiệm Thu.`}
            </p>
          </div>
        </div>

        {/* Decorative background element */}
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
        <button
          onClick={onBack}
          className="flex h-12 items-center justify-center rounded-2xl border border-neutral-100 bg-white text-[13px] font-bold text-neutral-400 transition-all hover:bg-neutral-50"
        >
          {t`Quay lại`}
        </button>
        <button
          disabled={isSubmitting}
          onClick={handleFinalizeAction}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-[13px] font-black text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-30"
        >
          <HiCheck className="h-5 w-5" />
          {t`CHỐT NGHIỆM THU`}
        </button>
      </div>
    </motion.div>
  );
};
