import { t } from "@lingui/core/macro";

import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";

export function DeleteChecklistConfirmation({
  cardPublicId,
  taskInstanceId,
  checklistPublicId,
}: {
  cardPublicId?: string;
  taskInstanceId?: string;
  checklistPublicId: string;
}) {
  const { closeModal, closeModals } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const deleteChecklist = api.checklist.delete.useMutation({
    onMutate: async () => {
      if (cardPublicId) {
        await utils.card.byId.cancel({ cardPublicId });
        const previous = utils.card.byId.getData({ cardPublicId });
        utils.card.byId.setData({ cardPublicId }, (old) => {
          if (!old) return old as any;
          const updatedChecklists = old.checklists.filter(
            (cl) => cl.publicId !== checklistPublicId,
          );
          return { ...old, checklists: updatedChecklists } as typeof old;
        });
        return { previous };
      }
      if (taskInstanceId) {
        await utils.taskInstance.byId.cancel({ id: taskInstanceId });
      }
      return { previous: undefined };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous && cardPublicId)
        utils.card.byId.setData({ cardPublicId }, ctx.previous);
      showPopup({
        header: t`Unable to delete checklist`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      closeModals(2);
      if (cardPublicId) {
        await invalidateCard(utils, cardPublicId);
      }
      if (taskInstanceId) {
        await utils.taskInstance.byId.invalidate({ id: taskInstanceId });
      }
    },
  });

  const handleDelete = () => {
    deleteChecklist.mutate({ checklistPublicId });
  };

  return (
    <div className="p-5">
      <div className="flex w-full flex-col justify-between pb-4">
        <h2 className="text-md pb-4 font-medium text-neutral-900 dark:text-dark-1000">
          {t`Are you sure you want to delete this checklist?`}
        </h2>
        <p className="text-sm font-medium text-light-900 dark:text-dark-900">
          {t`This action can't be undone.`}
        </p>
      </div>
      <div className="mt-5 flex justify-end space-x-2 sm:mt-6">
        <Button variant="secondary" onClick={() => closeModal()}>
          {t`Cancel`}
        </Button>
        <Button onClick={handleDelete} isLoading={deleteChecklist.isPending}>
          {t`Delete`}
        </Button>
      </div>
    </div>
  );
}
