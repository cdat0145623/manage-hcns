import { t } from "@lingui/core/macro";
import { HiMiniPlus } from "react-icons/hi2";

import Badge from "~/components/Badge";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

interface LabelSelectorProps {
  cardPublicId: string;
  labels: {
    key: string;
    value: string;
    selected: boolean;
    leftIcon: React.ReactNode;
  }[];
  isLoading: boolean;
  disabled?: boolean;
}

export default function LabelSelector({
  cardPublicId,
  labels,
  isLoading,
  disabled = false,
}: LabelSelectorProps) {
  const utils = api.useUtils();
  const { openModal } = useModal();
  const { showPopup } = usePopup();

  const addOrRemoveLabel = api.card.addOrRemoveLabel.useMutation({
    onMutate: async (update) => {
      await utils.card.byId.cancel();

      const previousCard = utils.card.byId.getData({ cardPublicId });

      utils.card.byId.setData({ cardPublicId }, (oldCard) => {
        if (!oldCard) return oldCard;

        const hasLabel = oldCard.labels.some(
          (label) => label.publicId === update.labelPublicId,
        );

        const labelToAdd = oldCard.labels.find(
          (label) => label.publicId === update.labelPublicId,
        );

        const updatedLabels = hasLabel
          ? oldCard.labels.filter(
              (label) => label.publicId !== update.labelPublicId,
            )
          : [
              ...oldCard.labels,
              {
                publicId: update.labelPublicId,
                name: labelToAdd?.name ?? "",
                colourCode: labelToAdd?.colourCode ?? "",
              },
            ];

        return {
          ...oldCard,
          labels: updatedLabels,
        };
      });

      return { previousCard };
    },
    onError: (_error, _newList, context) => {
      utils.card.byId.setData({ cardPublicId }, context?.previousCard);
      showPopup({
        header: t`Unable to update labels`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await invalidateCard(utils, cardPublicId);
    },
  });

  const selectedLabels = labels.filter((label) => label.selected);

  return (
    <>
      {isLoading ? (
        <div className="flex w-full">
          <div className="h-full w-[175px] animate-pulse rounded-[5px] bg-light-300 dark:bg-dark-300" />
        </div>
      ) : (
        <CheckboxDropdown
          items={labels}
          handleSelect={(_, label) => {
            addOrRemoveLabel.mutate({ cardPublicId, labelPublicId: label.key });
          }}
          handleEdit={disabled ? undefined : (labelPublicId) => openModal("EDIT_LABEL", labelPublicId)}
          handleCreate={disabled ? undefined : () => openModal("NEW_LABEL")}
          createNewItemLabel={t`Tạo nhãn mới`}
          disabled={disabled}
          asChild
        >
          {selectedLabels.length ? (
            <div className={`flex min-h-[34px] w-full flex-wrap items-center gap-1.5 rounded-xl bg-white px-2 py-1 text-left text-[13px] font-medium text-neutral-900 shadow-sm ring-1 ring-light-300 transition-all hover:bg-light-50 hover:ring-light-400 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              {selectedLabels.map((label) => (
                <Badge
                  key={label.key}
                  value={label.value}
                  iconLeft={label.leftIcon}
                />
              ))}
              <div className="flex items-center gap-1 px-1 text-light-500">
                <HiMiniPlus size={14} />
                <span className="text-[11px]">{t`Nhãn`}</span>
              </div>
            </div>
          ) : (
            <div className={`flex min-h-[34px] w-full items-center rounded-xl bg-white px-2.5 text-left text-[13px] font-medium text-neutral-900 shadow-sm ring-1 ring-light-300 transition-all hover:bg-light-50 hover:ring-light-400 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
              <HiMiniPlus size={16} className="mr-1.5 text-light-500" />
              {t`Nhãn`}
            </div>
          )}
        </CheckboxDropdown>
      )}
    </>
  );
}
