import { t } from "@lingui/core/macro";

import { fixServerDate } from "~/utils/helpers";
import { DueDateSelector } from "./DueDateSelector";
import LabelSelector from "./LabelSelector";
import ListSelector from "./ListSelector";
import MemberSelector from "./MemberSelector";

interface CardMetadataGridProps {
  cardId: string;
  card: any;
  formattedLists: any[];
  formattedMembers: any[];
  formattedLabels: any[];
  canEdit: boolean;
  updateCard: any;
  weekStartsOn?: 0 | 1 | 6;
}

export default function CardMetadataGrid({
  cardId,
  card,
  formattedLists,
  formattedMembers,
  formattedLabels,
  canEdit,
  updateCard,
  weekStartsOn = 1,
}: CardMetadataGridProps) {
  return (
    <div className="shrink-0 space-y-3 px-8 pb-2 pt-0.5">
      <div className="grid grid-cols-3 gap-3">
        <ListSelector
          cardPublicId={cardId}
          lists={formattedLists}
          isLoading={!card}
          disabled={!canEdit}
        />
        <MemberSelector
          cardPublicId={cardId}
          members={formattedMembers}
          isLoading={!card}
          disabled={!canEdit}
        />
        <LabelSelector
          cardPublicId={cardId}
          labels={formattedLabels}
          isLoading={!card}
          disabled={!canEdit}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <DueDateSelector
          cardPublicId={cardId}
          dueDate={card?.startDate}
          isLoading={!card}
          disabled={!canEdit}
          onDateSelect={(date) =>
            card &&
            updateCard.mutate({
              cardPublicId: card.publicId,
              startDate: date ?? null,
            })
          }
          weekStartsOn={weekStartsOn}
          label={t`Bắt đầu`}
        />
        <DueDateSelector
          cardPublicId={cardId}
          dueDate={card?.dueDate}
          isLoading={!card}
          disabled={!canEdit}
          onDateSelect={(date) =>
            card &&
            updateCard.mutate({
              cardPublicId: card.publicId,
              dueDate: date ?? null,
            })
          }
          weekStartsOn={weekStartsOn}
          label={t`Hết hạn`}
        />

        <div>
          <button
            disabled={!canEdit}
            onClick={() =>
              updateCard.mutate({
                cardPublicId: cardId,
                status:
                  card?.status === "done" ? "pending" : "done",
              })
            }
            className={`flex min-h-[34px] w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-medium shadow-sm ring-1 transition-all ${
              !canEdit
                ? "cursor-not-allowed opacity-60"
                : card?.status === "done"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-300 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-700/50 dark:hover:bg-emerald-900/30"
                  : "bg-white text-neutral-900 ring-light-300 hover:bg-light-50 hover:ring-light-400 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50"
            }`}
          >
            {card?.status === "done" ? (
              <>
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white dark:bg-emerald-400">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5">
                    <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="truncate">{t`Đã hoàn thành`}</span>
              </>
            ) : (
              <>
                <span className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-light-400 dark:ring-dark-400" />
                <span className="truncate">{t`Hoàn thành`}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
