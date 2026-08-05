import { t } from "@lingui/core/macro";

import type { RouterInputs } from "~/utils/api";
import FeedbackModal from "~/components/FeedbackModal";
import { LabelForm } from "~/components/LabelForm";
import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { EditYouTubeModal } from "~/components/YouTubeEmbed/EditYouTubeModal";
import { DeleteLabelConfirmation } from "../../../components/DeleteLabelConfirmation";
import { AttachmentUpload } from "./AttachmentUpload";
import { DeleteCardConfirmation } from "./DeleteCardConfirmation";
import { DeleteChecklistConfirmation } from "./DeleteChecklistConfirmation";
import { DeleteCommentConfirmation } from "./DeleteCommentConfirmation";
import { NewChecklistForm } from "./NewChecklistForm";

interface CardDetailsModalsProps {
  isOpen: boolean;
  modalContentType: string | null;
  entityId: string;
  boardId: string | undefined;
  cardId: string;
  refetchCard: () => Promise<void>;
  clearModalState: (key: string) => void;
  onCardDeleted?: () => void;
  boardByIdQueryInput?: RouterInputs["board"]["byId"];
}

export default function CardDetailsModals({
  isOpen,
  modalContentType,
  entityId,
  boardId,
  cardId,
  refetchCard,
  clearModalState,
  onCardDeleted,
  boardByIdQueryInput,
}: CardDetailsModalsProps) {
  return (
    <>
      <Modal
        modalSize="md"
        isVisible={isOpen && modalContentType === "NEW_FEEDBACK"}
      >
        <FeedbackModal />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "DELETE_CARD"}
      >
        <DeleteCardConfirmation
          boardPublicId={boardId ?? ""}
          cardPublicId={cardId}
          boardByIdQueryInput={boardByIdQueryInput}
          onDeleted={onCardDeleted}
        />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "DELETE_COMMENT"}
      >
        <DeleteCommentConfirmation
          cardPublicId={cardId}
          commentPublicId={entityId}
        />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
      >
        <NewWorkspaceForm />
      </Modal>

      <Modal
        modalSize="sm"
        centered
        isVisible={isOpen && modalContentType === "NEW_LABEL"}
      >
        <LabelForm boardPublicId={boardId ?? ""} refetch={refetchCard} />
      </Modal>

      <Modal
        modalSize="sm"
        centered
        isVisible={isOpen && modalContentType === "EDIT_LABEL"}
      >
        <LabelForm boardPublicId={boardId ?? ""} refetch={refetchCard} isEdit />
      </Modal>

      <Modal
        modalSize="sm"
        centered
        isVisible={isOpen && modalContentType === "DELETE_LABEL"}
      >
        <DeleteLabelConfirmation
          refetch={refetchCard}
          labelPublicId={entityId}
        />
      </Modal>

      <Modal
        modalSize="sm"
        centered
        isVisible={isOpen && modalContentType === "ADD_ATTACHMENT"}
      >
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
              {t`Đính kèm tài liệu`}
            </h3>
          </div>
          <AttachmentUpload cardPublicId={cardId} hideChecklistButton={true} />
        </div>
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "EDIT_YOUTUBE"}
      >
        <EditYouTubeModal />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "ADD_CHECKLIST"}
      >
        <NewChecklistForm cardPublicId={cardId} />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "DELETE_CHECKLIST"}
      >
        <DeleteChecklistConfirmation
          cardPublicId={cardId}
          checklistPublicId={entityId}
        />
      </Modal>
    </>
  );
}
