import { t } from "@lingui/macro";
import { format, differenceInDays } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import React from "react";
import {
  HiCheck,
  HiExclamationCircle,
  HiXMark,
  HiChevronDown,
  HiArrowPath,
  HiOutlineChevronDoubleDown,
} from "react-icons/hi2";

import { RewardStatus } from "./CardRewardSummaryCard";
import { api } from "~/utils/api";

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

interface CardRewardAdminReviewProps {
  data: {
    id: number;
    rewardType: "project" | "responsibility";
    bonusAmount: string | number | null;
    currency: string;
    approvalStatus: RewardStatus;
    deductions?: { id?: number; reason: string; value: string | number; unitType: string }[];
    snapshot?: CardSnapshot | null;
  };
  card: {
    cardTitle: string;
    startDate?: Date | null;
    dueDate?: Date | null;
    targetUser?: { name: string; email: string; avatarUrl?: string | null } | null;
  };
  onApprove: (logDecisions: any[], comment: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRevert?: () => Promise<void>;
}

export const CardRewardAdminReview = ({
  data,
  card,
  onApprove,
  onReject,
  onRevert,
}: CardRewardAdminReviewProps) => {
  const [comment, setComment] = React.useState("");
  const [commentError, setCommentError] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  
  // Fetch real violations from server
  const { data: preview, isLoading: isLoadingPreview } = api.reward.previewViolations.useQuery(
    { configId: data.id },
    { enabled: !!data.id }
  );

  const [decisions, setDecisions] = React.useState<Record<string, { deductionId: number | null; isSkipped: boolean }>>({});

  React.useEffect(() => {
    if (preview?.violations) {
      const initialDecisions: Record<string, { deductionId: number | null; isSkipped: boolean }> = {};
      preview.violations.forEach(v => {
        initialDecisions[v.violationType] = { deductionId: null, isSkipped: false };
      });
      setDecisions(initialDecisions);
    }
  }, [preview]);

  const handleApproveAction = async () => {
    setIsSubmitting(true);
    try {
      const logDecisions = Object.entries(decisions).map(([type, d]) => ({
        violationType: type,
        isSkipped: d.isSkipped,
        deductionId: d.deductionId
      }));
      
      await onApprove(logDecisions, comment);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectAction = async () => {
    if (!comment.trim()) {
      setCommentError(true);
      setTimeout(() => setCommentError(false), 500);
      return;
    }
    setIsSubmitting(true);
    try {
      await onReject(comment);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: string | number | null) => {
    if (val === null || val === undefined) return "0";
    return Number(val).toLocaleString("vi-VN");
  };

  const getViolationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      deadline_extended: t`Dời deadline`,
      deadline_shortened: t`Rút ngắn deadline`,
      assignee_changed: t`Thay đổi nhân sự`,
      start_date_changed: t`Thay đổi ngày bắt đầu`,
      reward_config_changed: t`Thay đổi cấu hình`,
      deduction_changed: t`Thay đổi khấu trừ`,
    };
    return labels[type] || type;
  };

  if (isLoadingPreview) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const isBreached = !!data.snapshot && preview?.violations && preview.violations.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-6 p-1 pb-10 font-sans"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-800">
          {t`CẤU HÌNH THƯỞNG / KHẤU TRỪ`}
        </h3>
        
        {isBreached ? (
          <div className="flex items-center gap-1.5 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700 shadow-sm">
            <HiExclamationCircle className="h-3 w-3" />
            {t`BREACHED`}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700 shadow-sm">
             <HiExclamationCircle className="h-3 w-3" />
             {t`WAITING APPROVAL`}
          </div>
        )}
      </div>

      {/* SNAPSHOT BOX */}
      {data.snapshot && (
        <div className="rounded-xl border border-neutral-200 bg-[#f9f9f5] p-5 shadow-sm">
          <span className="mb-4 block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            {t`SNAPSHOT (Bản đã chốt)`}
          </span>
          <div className="space-y-3 text-[13px] font-medium text-neutral-600">
            <div className="flex items-start gap-4">
               <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
               <div className="flex-1">
                 <span className="inline-block w-24 text-neutral-400">{t`Thời gian`}</span>
                 <span className="font-bold text-neutral-700">
                   {data.snapshot.snappedStartDate ? format(new Date(data.snapshot.snappedStartDate), "MMM d") : "?"} → {data.snapshot.snappedDueDate ? format(new Date(data.snapshot.snappedDueDate), "MMM d, yyyy") : "?"}
                 </span>
               </div>
            </div>
            <div className="flex items-start gap-4">
               <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
               <div className="flex-1">
                 <span className="inline-block w-24 text-neutral-400">{t`Số tiền`}</span>
                 <span className="font-black text-emerald-700">
                   {formatCurrency(data.snapshot.snappedBonusAmount)} {data.snapshot.snappedCurrency}
                 </span>
               </div>
            </div>
            <div className="flex items-start gap-4">
               <span className="mt-1 h-2 w-2 shrink-0 opacity-0" />
               <div className="flex-1">
                 <span className="inline-block w-24 text-neutral-400">{t`Người nhận`}</span>
                 <span className="font-bold text-neutral-700">
                   {card.targetUser?.name || t`Chưa xác định`}
                 </span>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* ALERT BANNER */}
      {isBreached && (
        <div className="flex items-center justify-center rounded-lg bg-[#f9f3e4] py-2 text-[10px] font-black uppercase tracking-tight text-amber-800">
          <HiChevronDown className="mr-2 h-4 w-4 animate-bounce" />
          {t`Đang có thay đổi mới so với bản đã chốt`}
        </div>
      )}

      {/* DRAFT BOX */}
      <div className={`rounded-xl border border-neutral-200 bg-[#fefaf0] p-5 shadow-sm ${!isBreached ? "bg-[#f9f9f5]" : ""}`}>
        <span className="mb-4 block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
          {isBreached ? t`DRAFT (Bản thảo mới - chưa duyệt)` : t`CHI TIẾT ĐỀ XUẤT`}
        </span>
        
        <div className="space-y-4 text-[13px] font-medium">
           {!isBreached && (
             <div className="flex flex-col gap-2">
               <div className="flex justify-between border-b border-dashed border-neutral-200 pb-2">
                 <span className="text-neutral-400">{t`Loại thưởng`}</span>
                 <span className="font-bold uppercase text-neutral-700">{data.rewardType === "project" ? t`Thưởng Dự Án` : t`Thưởng Trách Nhiệm`}</span>
               </div>
               <div className="flex justify-between border-b border-dashed border-neutral-200 pb-2">
                 <span className="text-neutral-400">{t`Số tiền`}</span>
                 <span className="font-black text-emerald-700">{formatCurrency(data.bonusAmount)} {data.currency}</span>
               </div>
               <div className="flex justify-between border-b border-dashed border-neutral-200 pb-2">
                 <span className="text-neutral-400">{t`Thời gian`}</span>
                 <span className="font-bold text-neutral-700">
                    {card.startDate ? format(new Date(card.startDate), "MMM d") : "?"} → {card.dueDate ? format(new Date(card.dueDate), "MMM d, yyyy") : "?"}
                 </span>
               </div>
               <div className="flex justify-between">
                 <span className="text-neutral-400">{t`Người nhận`}</span>
                 <span className="font-bold text-neutral-700">{card.targetUser?.name}</span>
               </div>
             </div>
           )}

           {isBreached && (
             <div className="space-y-3">
               <div className="flex items-center gap-4">
                 <span className="h-2 w-2 rounded-full bg-rose-500" />
                 <span className="w-24 text-neutral-400">{t`Hiện tại`}</span>
                 <div className="flex items-center gap-2 font-bold text-neutral-700 text-rose-600">
                    <span>{card.dueDate ? format(new Date(card.dueDate), "MMM d") : "?"}</span>
                    {preview?.violations.find(v => v.violationType.startsWith("deadline")) && (
                      <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-700">
                        {t`Trễ ${differenceInDays(new Date(card.dueDate!), new Date(data.snapshot!.snappedDueDate!))} ngày`}
                      </span>
                    )}
                 </div>
               </div>
               <div className="flex items-center gap-4">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <span className="w-24 text-neutral-400">{t`Thưởng đề xuất`}</span>
                  <span className="font-black text-neutral-700">
                    [ {formatCurrency(data.bonusAmount)} {data.currency} ]
                  </span>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* DEDUCTIONS TABLE */}
      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-800">
            {isBreached ? t`KHẤU TRỪ ĐỀ XUẤT` : t`DANH SÁCH KHẤU TRỪ`}
          </h4>
          <p className="text-[10px] font-medium italic text-neutral-400">
            — {isBreached ? t`Admin quyết định áp dụng hay bỏ qua` : t`Admin có thể bỏ qua từng khoản`}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/50 text-neutral-400">
              <tr>
                <th className="w-12 px-4 py-3"></th>
                <th className="px-4 py-3 font-semibold uppercase tracking-tight">{t`Lý do`}</th>
                <th className="px-4 py-3 font-semibold uppercase tracking-tight">{t`Loại`}</th>
                <th className="px-4 py-3 text-right font-semibold uppercase tracking-tight">{t`Giá trị`}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {isBreached && preview.violations.map((v) => {
                const decision = decisions[v.violationType] || { deductionId: null, isSkipped: false };
                const isSelected = !decision.isSkipped;
                
                return (
                  <tr key={v.violationType} className={`transition-colors ${!isSelected ? "opacity-30" : ""}`}>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDecisions(prev => ({
                          ...prev,
                          [v.violationType]: { ...decision, isSkipped: !decision.isSkipped }
                        }))}
                        className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                          isSelected ? "border-emerald-500 bg-emerald-500 text-white" : "border-neutral-200 bg-white"
                        }`}
                      >
                        {isSelected && <HiCheck className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-neutral-800">{getViolationTypeLabel(v.violationType)}</span>
                        {!decision.isSkipped && preview.availableDeductions.length > 0 && (
                          <div className="mt-2 flex items-center gap-2">
                             <select
                                value={decision.deductionId || ""}
                                onChange={(e) => setDecisions(prev => ({
                                  ...prev,
                                  [v.violationType]: { ...decision, deductionId: e.target.value ? Number(e.target.value) : null }
                                }))}
                                className="rounded border border-neutral-200 bg-white px-1 py-0.5 text-[10px] font-bold text-neutral-600 outline-none"
                             >
                               <option value="">-- {t`Chọn hình phạt`} --</option>
                               {preview.availableDeductions.map(ad => (
                                 <option key={ad.id} value={ad.id}>{ad.reason}</option>
                               ))}
                             </select>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-bold text-neutral-500">
                      {decision.deductionId ? 
                        (preview.availableDeductions.find(ad => ad.id === decision.deductionId)?.unitType === "percent" ? "%" : "VND") 
                      : t`Tùy chọn`}
                    </td>
                    <td className="px-4 py-3 text-right">
                       {decision.deductionId ? (
                         <span className="font-black text-rose-600">
                           -{formatCurrency(preview.availableDeductions.find(ad => ad.id === decision.deductionId)?.value || null)}
                           {preview.availableDeductions.find(ad => ad.id === decision.deductionId)?.unitType === "percent" ? "%" : "đ"}
                         </span>
                       ) : (
                         <span className="text-neutral-300 italic">{t`Chưa gán`}</span>
                       )}
                    </td>
                  </tr>
                );
              })}

              {!isBreached && data.deductions?.map((d, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="flex h-5 w-5 items-center justify-center rounded border border-emerald-500 bg-emerald-500 text-white">
                      <HiCheck className="h-3.5 w-3.5" />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-bold text-neutral-800">{d.reason}</td>
                  <td className="px-4 py-3 font-bold text-neutral-500 uppercase">{d.unitType}</td>
                  <td className="px-4 py-3 text-right font-black text-rose-500">
                    -{formatCurrency(d.value)}{d.unitType === "percent" ? "%" : "đ"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BREACH LOGS BOX */}
      {isBreached && (
        <div className="rounded-xl border border-rose-600 bg-rose-50/30 p-5">
           <span className="mb-3 block text-[9px] font-bold uppercase tracking-widest text-rose-600">
             {t`LỊCH SỬ VI PHẠM (Logs)`}
           </span>
           <div className="space-y-2">
              {preview.violations.map((v, i) => (
                <div key={i} className="flex items-center gap-3 text-[11px] font-bold text-neutral-700">
                   <span className="h-2 w-2 rounded-full bg-rose-500" />
                   <span className="text-neutral-400">{format(new Date(), "MMM d")}</span>
                   <span>{getViolationTypeLabel(v.violationType)}</span>
                   <span className="text-neutral-400">→</span>
                   <span className="font-black text-rose-600">-{formatCurrency(500000)}đ</span>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Decision Comment */}
      <div className="flex flex-col gap-3 pt-4">
        <label className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${commentError ? "text-rose-600" : "text-neutral-800"}`}>
          {t`GHI CHÚ (Bắt buộc khi từ chối) *`}
        </label>
        <motion.div
          animate={commentError ? { x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } } : {}}
        >
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (commentError) setCommentError(false);
            }}
            placeholder={t`Nhập ghi chú của Admin...`}
            className={`min-h-[100px] w-full rounded-xl border p-4 text-[13px] font-medium outline-none transition-all focus:ring-2 ${
              commentError 
                ? "border-rose-500 bg-rose-50/30 focus:ring-rose-100" 
                : "border-neutral-200 bg-white focus:border-neutral-400 focus:ring-neutral-100"
            }`}
          />
        </motion.div>
      </div>

      {/* FINAL ACTIONS */}
      <div className="flex items-center gap-3 pt-6">
        <button
          disabled={isSubmitting}
          onClick={handleApproveAction}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-[13px] font-bold text-neutral-800 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-30"
        >
          <HiCheck className="h-5 w-5 text-emerald-600" />
          {isBreached ? t`Duyệt thay đổi` : t`Duyệt`}
        </button>

        {isBreached && onRevert && (
          <button
            disabled={isSubmitting}
            onClick={onRevert}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-[13px] font-bold text-neutral-800 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98]"
          >
            <HiArrowPath className="h-5 w-5 text-amber-600" />
            {t`Khôi phục`}
          </button>
        )}

        <button
          disabled={isSubmitting}
          onClick={handleRejectAction}
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-20 ${
            commentError 
              ? "border-rose-300 bg-rose-50 text-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.1)]" 
              : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          <HiXMark className="h-5 w-5 text-rose-500" />
          {t`Từ chối`}
        </button>

        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-100 bg-white text-neutral-400 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.95]">
          <HiOutlineChevronDoubleDown className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
};
