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

      <div className="grid grid-cols-2 gap-3">
        <DueDateSelector
          cardPublicId={cardId}
          dueDate={card?.startDate ? fixServerDate(card.startDate) : null}
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
          dueDate={card?.dueDate ? fixServerDate(card.dueDate) : null}
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
      </div>
    </div>
  );
}
