import { t } from "@lingui/macro";
import { motion } from "framer-motion";
import React from "react";
import {
  HiExclamationTriangle,
  HiArrowRight,
  HiClock,
  HiUser,
  HiPencilSquare,
} from "react-icons/hi2";
import { detectRewardMismatch } from "~/utils/reward";

interface RewardBreachListPopupProps {
  userId: string;
  userName: string;
  cards: any[];
  onReviewCard: (publicId: string) => void;
  onClose: () => void;
}

export const RewardBreachListPopup = ({
  userId,
  userName,
  cards,
  onReviewCard,
  onClose,
}: RewardBreachListPopupProps) => {
  // Filter only cards that have mismatches
  const breachedCards = cards
    .map((c) => {
      const mismatch = detectRewardMismatch(
        {
          title: c.config.cardTitle || c.cardTitle || "Untitled",
          startDate: c.startDate,
          dueDate: c.dueDate,
          assigneeId: c.targetUser || c.assigneeId,
          bonusAmount: c.config.bonusAmount,
          currency: c.config.currency,
          deductions: c.deductions,
        },
        c.snapshot
      );
      return { ...c, mismatch };
    })
    .filter((c) => c.mismatch.hasMismatch);

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 shadow-sm">
            <HiExclamationTriangle className="h-7 w-7" />
          </div>
          <div>
            <h3 className="text-base font-black uppercase tracking-tight text-neutral-900">
              {t`PHÁT HIỆN VI PHẠM THƯỞNG`}
            </h3>
            <p className="text-[11px] font-bold text-neutral-400">
              {t`Nhân sự`}: <span className="text-indigo-600 font-black">{userName}</span> • {breachedCards.length} {t`thẻ cần xem xét`}
            </p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        {breachedCards.length > 0 ? (
          <div className="flex flex-col gap-4">
            {breachedCards.map((item, idx) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                key={item.config.publicId || item.publicId}
                onClick={() => onReviewCard(item.publicId || item.config.cardPublicId)}
                className="group cursor-pointer rounded-2xl border border-neutral-100 bg-white p-5 transition-all hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="text-sm font-black text-neutral-800 group-hover:text-indigo-600">
                      {item.config.cardTitle || item.cardTitle || t`Untitled Card`}
                    </h4>
                    
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.mismatch.violations.map((v: any, vIdx: number) => (
                        <div
                          key={vIdx}
                          className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-bold text-rose-600"
                        >
                          {v.field === "deadline" && <HiClock className="h-3 w-3" />}
                          {v.field === "assignee" && <HiUser className="h-3 w-3" />}
                          {v.field === "title" && <HiPencilSquare className="h-3 w-3" />}
                          <span>{v.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-50 text-neutral-400 transition-colors group-hover:bg-indigo-600 group-hover:text-white">
                    <HiArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-400">
            <p className="text-xs font-bold uppercase tracking-widest">{t`Không tìm thấy vi phạm mới`}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end pt-2">
        <button
          onClick={onClose}
          className="rounded-xl px-6 py-2.5 text-xs font-black uppercase tracking-widest text-neutral-400 transition-colors hover:text-neutral-600"
        >
          {t`Đóng`}
        </button>
      </div>
    </div>
  );
};
