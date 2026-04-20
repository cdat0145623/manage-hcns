import type { RouterInputs } from "~/utils/api";
import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

interface DeleteCardConfirmationProps {
  cardPublicId: string;
  boardPublicId: string;
  /** Must match board page `useQuery` input (filters + type) or optimistic update hits the wrong cache key. */
  boardByIdQueryInput?: RouterInputs["board"]["byId"];
  /** Close parent card surface (board slide-over, calendar modal, full card page). */
  onDeleted?: () => void;
}

export function DeleteCardConfirmation({
  cardPublicId,
  boardPublicId,
  boardByIdQueryInput,
  onDeleted,
}: DeleteCardConfirmationProps) {
  const { closeModal, clearAllModals } = useModal();
  const utils = api.useUtils();
  const { showPopup } = usePopup();

  const boardQueryInput: RouterInputs["board"]["byId"] =
    boardByIdQueryInput ?? { boardPublicId };

  const deleteCardMutation = api.card.delete.useMutation({
    onMutate: async (args) => {
      await utils.board.byId.cancel(boardQueryInput);

      const currentState = utils.board.byId.getData(boardQueryInput);

      utils.board.byId.setData(boardQueryInput, (oldBoard) => {
        if (!oldBoard) return oldBoard;

        const updatedLists = oldBoard.lists.map((list) => {
          const updatedCards = list.cards.filter(
            (card) => card.publicId !== args.cardPublicId,
          );
          return { ...list, cards: updatedCards };
        });

        return { ...oldBoard, lists: updatedLists };
      });

      return { previousState: currentState };
    },
    onError: (_error, _newList, context) => {
      utils.board.byId.setData(boardQueryInput, context?.previousState);
      showPopup({
        header: "Không thể xóa thẻ",
        message: "Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ khách hàng.",
        icon: "error",
      });
    },
    onSuccess: () => {
      clearAllModals();
      onDeleted?.();
    },
    onSettled: (_data, error) => {
      if (error) {
        closeModal();
      }
    },
  });

  const handleDeleteCard = () => {
    deleteCardMutation.mutate({
      cardPublicId,
    });
  };

  return (
    <div className="p-5">
      <div className="flex w-full flex-col justify-between pb-4">
        <h2 className="text-md pb-4 font-medium text-neutral-900 dark:text-dark-1000">
          Bạn có chắc chắn muốn xóa thẻ này không?
        </h2>
        <p className="text-sm font-medium text-light-900 dark:text-dark-900">
          Thao tác này không thể hoàn tác.
        </p>
      </div>
      <div className="mt-5 flex justify-end sm:mt-6">
        <button
          className="mr-4 inline-flex justify-center rounded-md border-[1px] border-light-600 bg-light-50 px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm focus-visible:outline-none dark:border-dark-600 dark:bg-dark-300 dark:text-dark-1000"
          onClick={() => closeModal()}
        >
          Hủy
        </button>
        <Button
          onClick={handleDeleteCard}
          isLoading={deleteCardMutation.isPending}
        >
          Xóa
        </Button>
      </div>
    </div>
  );
}
