import { t } from "@lingui/core/macro";
import ListSelector from "./ListSelector";
import MemberSelector from "./MemberSelector";
import LabelSelector from "./LabelSelector";
import { DueDateSelector } from "./DueDateSelector";

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
    <div className="shrink-0 space-y-6 px-6 pb-6 pt-6">
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
      </div>
    </div>
  );
}
