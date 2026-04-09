import { t } from "@lingui/core/macro";

import CheckboxDropdown from "~/components/CheckboxDropdown";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

interface ListSelectorProps {
  cardPublicId: string;
  lists: {
    key: string;
    value: string;
    selected: boolean;
  }[];
  isLoading: boolean;
  disabled?: boolean;
}

export default function ListSelector({
  cardPublicId,
  lists,
  isLoading,
  disabled = false,
}: ListSelectorProps) {
  const utils = api.useUtils();

  const { showPopup } = usePopup();

  const updateCardList = api.card.update.useMutation({
    onMutate: async (newList) => {
      await utils.card.byId.cancel();

      const previousCard = utils.card.byId.getData({ cardPublicId });

      utils.card.byId.setData({ cardPublicId }, (oldCard) => {
        if (!oldCard) return oldCard;

        return {
          ...oldCard,
          list: {
            ...oldCard.list,
            publicId: newList.listPublicId ?? "",
            name: oldCard.list.name ?? "",
            board: oldCard.list.board ?? null,
          },
        };
      });

      return { previousCard };
    },
    onError: (_error, _newList, context) => {
      utils.card.byId.setData({ cardPublicId }, context?.previousCard);
      showPopup({
        header: t`Unable to update list`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      await invalidateCard(utils, cardPublicId);
    },
  });

  const selectedList = lists.find((list) => list.selected);

  return (
    <>
      {isLoading ? (
        <div className="flex w-full">
          <div className="h-full w-[150px] animate-pulse rounded-[5px] bg-light-300 dark:bg-dark-300" />
        </div>
      ) : (
        <CheckboxDropdown
          items={lists}
          handleSelect={(_, member) => {
            updateCardList.mutate({
              cardPublicId,
              listPublicId: member.key,
              index: 0,
            });
          }}
          disabled={disabled}
          asChild
        >
          <div
            className={`flex min-h-[40px] w-full items-center rounded-xl bg-light-100/40 px-2.5 text-left text-[13px] font-medium text-neutral-900 ring-1 ring-light-200/50 transition-all hover:bg-light-100/60 hover:ring-light-300 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {selectedList?.value}
          </div>
        </CheckboxDropdown>
      )}
    </>
  );
}
