import { t } from "@lingui/macro";
import { motion } from "framer-motion";
import React from "react";
import {
  HiArrowRight,
  HiExclamationTriangle,
  HiMagnifyingGlassCircle,
} from "react-icons/hi2";

import { formatInAppCalendarZone } from "@kan/shared/utils";

import { detectRewardMismatch } from "~/utils/reward";

interface RewardBreachModalContentProps {
  userName: string;
  cards: any[];
  onOpenCard: (cardPublicId: string) => void;
  onClose: () => void;
}

export const RewardBreachModalContent = ({
  userName,
  cards,
  onOpenCard,
  onClose,
}: RewardBreachModalContentProps) => {
  // Filter only cards that have mismatches
  const breachedCards = cards
    .map((cardData: any) => {
      const mismatch = detectRewardMismatch(
        {
          title: cardData.title,
          startDate: cardData.startDate,
          dueDate: cardData.dueDate,
          assigneeId: cardData.targetUser,
          bonusAmount: cardData.bonusAmount,
          currency: cardData.currency,
          deductions: cardData.deductions,
        },
        cardData.snapshot,
      );
      return { ...cardData, mismatch };
    })
    .filter((c) => c.mismatch.hasMismatch);

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-light-100 pb-6 dark:border-dark-300">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
          <HiExclamationTriangle size={32} />
        </div>
        <div>
          <h2 className="text-xl font-black tracking-tight text-neutral-900 dark:text-dark-1000">
            {t`Phát hiện sai lệch thưởng`}
          </h2>
          <p className="text-xs font-bold text-neutral-400">
            {t`Nhân sự`}: <span className="text-rose-500">{userName}</span> •{" "}
            {breachedCards.length} {t`Card cần xem xét`}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="custom-scrollbar max-h-[60vh] overflow-y-auto pr-2">
        {breachedCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-300">
            <HiMagnifyingGlassCircle size={64} className="opacity-20" />
            <p className="mt-4 text-xs font-bold uppercase tracking-widest">{t`Không tìm thấy sai lệch nào`}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {breachedCards.map((card) => (
              <motion.button
                key={card.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onOpenCard(card.publicId)}
                className="group relative flex flex-col gap-3 rounded-3xl border border-light-200 bg-white p-5 text-left transition-all hover:border-rose-200 hover:shadow-xl hover:shadow-rose-500/5 dark:border-dark-300 dark:bg-dark-200 dark:hover:border-rose-900/40"
              >
                <div className="flex items-start justify-between">
                  <h4 className="flex-1 text-sm font-black leading-snug text-neutral-800 dark:text-dark-1000">
                    {card.title}
                  </h4>
                  <HiArrowRight className="h-4 w-4 -translate-x-2 text-neutral-300 opacity-0 transition-all group-hover:translate-x-0 group-hover:text-rose-500 group-hover:opacity-100" />
                </div>

                <div className="flex flex-wrap gap-2">
                  {card.mismatch.violations.map((v: any, idx: number) => (
                    <span
                      key={idx}
                      className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                    >
                      {v.description}
                    </span>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-light-100 pt-3 text-[10px] font-bold text-neutral-400 dark:border-dark-300">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-neutral-300 dark:bg-dark-400" />
                    {card.snapshot?.snappedDueDate
                      ? formatInAppCalendarZone(
                          card.snapshot.snappedDueDate,
                          "MMM d",
                        )
                      : "?"}
                  </div>
                  <span className="font-black uppercase tracking-widest text-rose-500/80">
                    {t`Xử lý ngay`} →
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onClose}
          className="rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-widest text-neutral-400 transition-all hover:bg-neutral-50 dark:hover:bg-dark-300"
        >
          {t`Đóng`}
        </button>
      </div>
    </div>
  );
};
