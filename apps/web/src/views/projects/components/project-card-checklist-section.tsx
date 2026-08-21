import { t } from "@lingui/core/macro";
import { HiMiniPlus } from "react-icons/hi2";

import type { RouterOutputs } from "~/utils/api";
import Modal from "~/components/modal";
import { useModal } from "~/providers/modal";
import { api } from "~/utils/api";
import Checklists from "../../card/components/Checklists";
import { DeleteChecklistConfirmation } from "../../card/components/DeleteChecklistConfirmation";
import { NewChecklistForm } from "../../card/components/NewChecklistForm";

type ProjectBoard = RouterOutputs["projectBoard"]["byId"];
type ProjectCardDetail = RouterOutputs["projectBoard"]["getCard"];

const addChecklistToProjectCaches = (
  utils: ReturnType<typeof api.useUtils>,
  boardPublicId: string,
  cardPublicId: string,
  checklist: RouterOutputs["checklist"]["create"],
) => {
  utils.projectBoard.getCard.setData({ cardPublicId }, (currentCard) => {
    if (!currentCard) return currentCard;
    if (
      currentCard.checklists.some(
        (item) => item.publicId === checklist.publicId,
      )
    ) {
      return currentCard;
    }

    return {
      ...currentCard,
      checklists: [
        ...currentCard.checklists,
        {
          ...checklist,
          index: currentCard.checklists.length,
          items: [],
        },
      ],
    };
  });

  utils.projectBoard.byId.setData({ boardPublicId }, (currentBoard) => {
    if (!currentBoard) return currentBoard;

    return {
      ...currentBoard,
      lists: currentBoard.lists.map((list) => ({
        ...list,
        cards: list.cards.map((listCard) => {
          if (listCard.publicId !== cardPublicId) return listCard;
          if (
            listCard.checklists.some(
              (item) => item.publicId === checklist.publicId,
            )
          ) {
            return listCard;
          }

          return {
            ...listCard,
            checklists: [
              ...listCard.checklists,
              {
                ...checklist,
                index: listCard.checklists.length,
                items: [],
              },
            ],
          };
        }),
      })),
    };
  });
};

const addChecklistItemToProjectCaches = (
  utils: ReturnType<typeof api.useUtils>,
  boardPublicId: string,
  cardPublicId: string,
  checklistPublicId: string,
  item: RouterOutputs["checklist"]["createItem"],
) => {
  utils.projectBoard.getCard.setData({ cardPublicId }, (currentCard) => {
    if (!currentCard) return currentCard;

    return {
      ...currentCard,
      checklists: currentCard.checklists.map((checklist) => {
        if (checklist.publicId !== checklistPublicId) return checklist;
        if (
          checklist.items.some(
            (checklistItem) => checklistItem.publicId === item.publicId,
          )
        ) {
          return checklist;
        }

        return {
          ...checklist,
          items: [
            ...checklist.items,
            { ...item, index: checklist.items.length },
          ],
        };
      }),
    };
  });

  utils.projectBoard.byId.setData({ boardPublicId }, (currentBoard) => {
    if (!currentBoard) return currentBoard;

    return {
      ...currentBoard,
      lists: currentBoard.lists.map((list) => ({
        ...list,
        cards: list.cards.map((listCard) => {
          if (listCard.publicId !== cardPublicId) return listCard;

          return {
            ...listCard,
            checklists: listCard.checklists.map((checklist) => {
              if (checklist.publicId !== checklistPublicId) return checklist;
              if (
                checklist.items.some(
                  (checklistItem) => checklistItem.publicId === item.publicId,
                )
              ) {
                return checklist;
              }

              return {
                ...checklist,
                items: [
                  ...checklist.items,
                  { ...item, index: checklist.items.length },
                ],
              };
            }),
          };
        }),
      })),
    };
  });
};

interface ProjectCardChecklistSectionProps {
  boardPublicId: ProjectBoard["publicId"];
  cardPublicId: string;
  cardDetail: ProjectCardDetail | undefined;
  canEdit: boolean;
  isOpen: boolean;
  activeChecklistForm: string | null;
  setActiveChecklistForm: (id: string | null) => void;
  onRefresh: () => Promise<void>;
}

export default function ProjectCardChecklistSection({
  boardPublicId,
  cardPublicId,
  cardDetail,
  canEdit,
  isOpen,
  activeChecklistForm,
  setActiveChecklistForm,
  onRefresh,
}: ProjectCardChecklistSectionProps) {
  const { entityId, modalContentType, openModal } = useModal();
  const utils = api.useUtils();
  const checklists = cardDetail?.checklists ?? [];

  return (
    <>
      <section className="mt-8 border-t border-light-200 pt-6 dark:border-dark-300">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
            {t`Checklist`}
          </h3>
          {canEdit && (
            <button
              type="button"
              onClick={() => openModal("ADD_CHECKLIST", cardPublicId)}
              className="flex items-center justify-center rounded-lg bg-light-100 p-1 text-neutral-600 transition-all hover:bg-light-200 hover:text-neutral-900 dark:bg-dark-300 dark:text-dark-800 dark:hover:bg-dark-400 dark:hover:text-dark-1000"
              title={t`Thêm Checklist`}
            >
              <HiMiniPlus className="h-4 w-4" />
            </button>
          )}
        </div>
        <Checklists
          checklists={checklists}
          cardPublicId={cardPublicId}
          activeChecklistForm={activeChecklistForm}
          setActiveChecklistForm={setActiveChecklistForm}
          onItemCreated={(checklistPublicId, item) =>
            addChecklistItemToProjectCaches(
              utils,
              boardPublicId,
              cardPublicId,
              checklistPublicId,
              item,
            )
          }
          onChanged={onRefresh}
          viewOnly={!canEdit}
        />
        {checklists.length === 0 && (
          <p className="text-sm text-light-800 dark:text-dark-800">
            {t`Chưa có checklist.`}
          </p>
        )}
      </section>

      <Modal
        modalSize="sm"
        centered
        isVisible={isOpen && modalContentType === "ADD_CHECKLIST"}
      >
        <NewChecklistForm
          cardPublicId={cardPublicId}
          onCreated={(checklist) =>
            addChecklistToProjectCaches(
              utils,
              boardPublicId,
              cardPublicId,
              checklist,
            )
          }
          onSuccess={() => void onRefresh()}
        />
      </Modal>
      <Modal
        modalSize="sm"
        centered
        isVisible={
          isOpen && modalContentType === "DELETE_CHECKLIST" && Boolean(entityId)
        }
      >
        <DeleteChecklistConfirmation
          cardPublicId={cardPublicId}
          checklistPublicId={entityId}
          onChanged={onRefresh}
        />
      </Modal>
    </>
  );
}
