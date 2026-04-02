import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { HiXMark } from "react-icons/hi2";

import { authClient } from "@kan/auth/client";

import Avatar from "~/components/Avatar";
import Editor from "~/components/Editor";
import FeedbackModal from "~/components/FeedbackModal";
import { LabelForm } from "~/components/LabelForm";
import LabelIcon from "~/components/LabelIcon";
import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { EditYouTubeModal } from "~/components/YouTubeEmbed/EditYouTubeModal";
import { usePermissions } from "~/hooks/usePermissions";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { invalidateCard } from "~/utils/cardInvalidation";
import { formatMemberDisplayName, getAvatarUrl } from "~/utils/helpers";
import { DeleteLabelConfirmation } from "../../../components/DeleteLabelConfirmation";
import ActivityList from "./ActivityList";
import { AttachmentThumbnails } from "./AttachmentThumbnails";
import { AttachmentUpload } from "./AttachmentUpload";
import Checklists from "./Checklists";
import { DeleteCardConfirmation } from "./DeleteCardConfirmation";
import { DeleteChecklistConfirmation } from "./DeleteChecklistConfirmation";
import { DeleteCommentConfirmation } from "./DeleteCommentConfirmation";
import Dropdown from "./Dropdown";
import { DueDateSelector } from "./DueDateSelector";
import LabelSelector from "./LabelSelector";
import ListSelector from "./ListSelector";
import MemberSelector from "./MemberSelector";
import { NewChecklistForm } from "./NewChecklistForm";
import NewCommentForm from "./NewCommentForm";

interface FormValues {
  cardId: string;
  title: string;
  description: string;
}

interface CardDetailsModalContentProps {
  cardId: string | undefined;
  isTemplate?: boolean;
  onClose: () => void;
}

import DateSelector from "~/components/DateSelector";
import { childModalTypes } from "../constants";

function SideDockedPopup({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-full top-0 ml-4 z-[60] w-80 rounded-xl border border-white/20 bg-white/70 shadow-2xl backdrop-blur-xl dark:border-dark-600/30 dark:bg-dark-100/70 hidden md:block animate-in fade-in slide-in-from-left-4 duration-300 ease-out">
      <div className="flex items-center justify-between border-b border-light-200/50 px-5 py-4 dark:border-dark-300/50">
        <h3 className="text-sm font-bold tracking-tight text-light-900 dark:text-dark-1000">
          {title}
        </h3>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-light-700 transition-colors hover:bg-light-200/80 dark:text-dark-700 dark:hover:bg-dark-300/80"
        >
          <HiXMark className="h-5 w-5" />
        </button>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

export default function CardDetailsModalContent({
  cardId,
  isTemplate,
  onClose,
}: CardDetailsModalContentProps) {
  const utils = api.useUtils();
  const {
    modalContentType,
    entityId,
    getModalState,
    clearModalState,
    closeModal,
    isOpen,
    modalStates,
  } = useModal();
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const { canEditCard, canAttach, canTick, canCreateComment } = usePermissions();
  const { data: session } = authClient.useSession();
  const [activeChecklistForm, setActiveChecklistForm] = useState<string | null>(
    null,
  );

  const { data: card, isLoading } = api.card.byId.useQuery(
    { cardPublicId: cardId ?? "" },
    { enabled: !!cardId && cardId.length >= 12 },
  );
console.log(card)
  const isCreator = card?.createdBy && session?.user.id === card.createdBy;
  const canEdit = canEditCard || isCreator;

  const refetchCard = async () => {
    if (cardId) await utils.card.byId.refetch({ cardPublicId: cardId });
  };

  const board = card?.list.board;
  const labels = board?.labels;
  const workspaceMembers = board?.workspace.members;
  const boardId = board?.publicId;
  const selectedLabels = card?.labels;
  const selectedMembers = card?.members;

  const formattedLabels =
    labels?.map((label) => {
      const isSelected = selectedLabels?.some(
        (selectedLabel) => selectedLabel.publicId === label.publicId,
      );
      return {
        key: label.publicId,
        value: label.name,
        selected: isSelected ?? false,
        leftIcon: <LabelIcon colourCode={label.colourCode} />,
      };
    }) ?? [];

  const formattedLists =
    board?.lists.map((list) => ({
      key: list.publicId,
      value: list.name,
      selected: list.publicId === card?.list.publicId,
    })) ?? [];

  const formattedMembers =
    workspaceMembers?.map((member) => {
      const isSelected = selectedMembers?.some(
        (assignedMember) => assignedMember.publicId === member.publicId,
      );
      return {
        key: member.publicId,
        value: formatMemberDisplayName(
          member.user?.name ?? null,
          member.user?.email ?? member.email,
        ),
        imageUrl: member.user?.image
          ? getAvatarUrl(member.user.image)
          : undefined,
        selected: isSelected ?? false,
        leftIcon: (
          <Avatar
            size="xs"
            name={member.user?.name ?? ""}
            imageUrl={
              member.user?.image ? getAvatarUrl(member.user.image) : undefined
            }
            email={member.user?.email ?? member.email ?? ""}
          />
        ),
      };
    }) ?? [];

  const editorWorkspaceMembers =
    workspaceMembers
      ?.filter((member): member is typeof member & { email: string } =>
        member.email !== null,
      )
      .map((member) => ({
        publicId: member.publicId,
        email: member.email,
        user: member.user
          ? {
              id: member.user.id,
              name: member.user.name ?? null,
              image: member.user.image ?? null,
            }
          : null,
      })) ?? [];

  const updateCard = api.card.update.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to update card`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      if (cardId) await invalidateCard(utils, cardId);
    },
  });

  const addOrRemoveLabel = api.card.addOrRemoveLabel.useMutation({
    onError: () => {
      showPopup({
        header: t`Unable to add label`,
        message: t`Please try again later, or contact customer support.`,
        icon: "error",
      });
    },
    onSettled: async () => {
      if (cardId) {
        await utils.card.byId.invalidate({ cardPublicId: cardId });
      }
    },
  });

  const { register, handleSubmit, setValue } = useForm<FormValues>({
    values: {
      cardId: cardId ?? "",
      title: card?.title ?? "",
      description: card?.description ?? "",
    },
  });

  const onSubmit = (values: FormValues) => {
    updateCard.mutate({
      cardPublicId: values.cardId,
      title: values.title,
      description: values.description,
    });
  };

  // Add new created label to selected labels
  useEffect(() => {
    const newLabelId = modalStates.NEW_LABEL_CREATED as string | undefined;
    if (newLabelId && cardId) {
      const isAlreadyAdded = card?.labels.some(
        (label) => label.publicId === newLabelId,
      );
      if (!isAlreadyAdded) {
        addOrRemoveLabel.mutate({
          cardPublicId: cardId,
          labelPublicId: newLabelId,
        });
      }
      clearModalState("NEW_LABEL_CREATED");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalStates.NEW_LABEL_CREATED, card, cardId]);

  // Open new item form after creating a new checklist
  useEffect(() => {
    if (!card) return;
    const state = getModalState("ADD_CHECKLIST") as
      | { createdChecklistId?: string }
      | undefined;
    const createdId = state?.createdChecklistId;
    if (createdId) {
      setActiveChecklistForm(createdId);
      clearModalState("ADD_CHECKLIST");
    }
  }, [card, getModalState, clearModalState]);

  // Auto-resize title textarea
  useEffect(() => {
    const titleTextarea = document.getElementById(
      "card-modal-title",
    ) as HTMLTextAreaElement | null;
    if (titleTextarea) {
      titleTextarea.style.height = "auto";
      titleTextarea.style.height = `${titleTextarea.scrollHeight}px`;
    }
  }, [card]);

  if (!cardId) return null;

  const isSideDocked = modalContentType && childModalTypes.includes(modalContentType);

  return (
    <div className="relative">
      {/* Side-Docked Popups (Desktop only) */}
      {isOpen && isSideDocked && (
        <div className="hidden md:block">
          <SideDockedPopup
            title={
              modalContentType === "NEW_LABEL" ? t`Create new label` :
              modalContentType === "EDIT_LABEL" ? t`Edit label` :
              modalContentType === "DELETE_LABEL" ? t`Delete label` :
              modalContentType === "ADD_CHECKLIST" ? t`Add checklist` :
              modalContentType === "DUE_DATE" ? t`Set due date` : ""
            }
            onClose={closeModal}
          >
            {modalContentType === "NEW_LABEL" && (
              <LabelForm boardPublicId={boardId ?? ""} refetch={refetchCard} hideHeader />
            )}
            {modalContentType === "EDIT_LABEL" && (
              <LabelForm boardPublicId={boardId ?? ""} refetch={refetchCard} isEdit hideHeader />
            )}
            {modalContentType === "DELETE_LABEL" && (
              <DeleteLabelConfirmation refetch={refetchCard} labelPublicId={entityId} />
            )}
            {modalContentType === "ADD_CHECKLIST" && (
              <NewChecklistForm cardPublicId={cardId} hideHeader />
            )}
            {modalContentType === "DUE_DATE" && card && (
              <DateSelector
                selectedDate={card.dueDate}
                onDateSelect={(date) => {
                  updateCard.mutate({
                    cardPublicId: card.publicId,
                    dueDate: date ?? null,
                  });
                }}
                weekStartsOn={workspace.weekStartDay}
              />
            )}
          </SideDockedPopup>
        </div>
      )}

      {/* Two-column layout: left (main) + right (sidebar) */}
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg md:flex-row shadow-2xl">
        {/* Header bar */}
        <div className="flex w-full items-center justify-between border-b border-light-300 bg-light-50 px-5 py-3 dark:border-dark-300 dark:bg-dark-100 md:hidden">
          <span className="text-sm font-semibold text-light-900 dark:text-dark-900">
            {card?.title ?? t`Card`}
          </span>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-light-700 hover:bg-light-200 dark:text-dark-700 dark:hover:bg-dark-200"
          >
            <HiXMark className="h-4 w-4" />
          </button>
        </div>

        {/* Left column — main content */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6">
          {/* Title + close button row */}
          <div className="mb-4 flex items-start justify-between">
            {!card && isLoading && (
              <div className="h-8 w-48 animate-pulse rounded bg-light-300 dark:bg-dark-300" />
            )}
            {card && (
              <form onSubmit={handleSubmit(onSubmit)} className="mr-3 w-full">
                <textarea
                  id="card-modal-title"
                  {...register("title")}
                  onBlur={canEdit ? handleSubmit(onSubmit) : undefined}
                  rows={1}
                  disabled={!canEdit}
                  className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-xl font-bold leading-relaxed text-neutral-900 focus:ring-0 dark:text-dark-1000 ${!canEdit ? "cursor-default" : ""}`}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                />
              </form>
            )}
            <div className="flex shrink-0 items-center gap-1">
              {card && (
                <Dropdown
                  cardPublicId={cardId}
                  isTemplate={isTemplate}
                  boardPublicId={boardId}
                  cardCreatedBy={card.createdBy}
                />
              )}
              <button
                onClick={onClose}
                className="hidden h-7 w-7 items-center justify-center rounded-md text-light-700 hover:bg-light-200 dark:text-dark-700 dark:hover:bg-dark-200 md:flex"
              >
                <HiXMark className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Description */}
          {card && (
            <div className="mb-6">
              <form onSubmit={handleSubmit(onSubmit)}>
                <Editor
                  content={card.description}
                  onChange={
                    canEdit ? (e) => setValue("description", e) : undefined
                  }
                  onBlur={canEdit ? () => handleSubmit(onSubmit)() : undefined}
                  workspaceMembers={workspaceMembers?.filter(
                    (m): m is typeof m & { email: string } => m.email !== null,
                  ) ?? []}
                  readOnly={!canEdit}
                />
              </form>
            </div>
          )}

          {/* Checklists */}
          {card && (
            <Checklists
              checklists={card.checklists}
              cardPublicId={cardId}
              activeChecklistForm={activeChecklistForm}
              setActiveChecklistForm={setActiveChecklistForm}
              viewOnly={!canEdit}
            />
          )}

          {/* Attachments */}
          {card && !isTemplate && (
            <>
              {card.attachments.length > 0 && (
                <div className="mt-4">
                  <AttachmentThumbnails
                    attachments={card.attachments}
                    cardPublicId={cardId}
                    isReadOnly={!canEdit}
                  />
                </div>
              )}
              {(canAttach && (isCreator || card.members.map((m) => m.user?.id).includes(session?.user.id))) && (
                <div className="mt-4">
                  <AttachmentUpload cardPublicId={cardId} />
                </div>
              )}
            </>
          )}

          {/* Activity */}
          {card && (
            <div className="mt-6 border-t border-light-300 pt-6 dark:border-dark-300">
              <h2 className="mb-4 text-sm font-semibold text-light-1000 dark:text-dark-1000">
                {t`Activity`}
              </h2>
              <ActivityList
                cardPublicId={cardId}
                isLoading={!card}
                isAdmin={workspace.role === "ADMIN"}
              />
              {!isTemplate && (canCreateComment && (isCreator || card.members.map((m) => m.user?.id).includes(session?.user.id))) && (
                <div className="mt-4">
                  <NewCommentForm
                    cardPublicId={cardId}
                    workspaceMembers={editorWorkspaceMembers}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right column — sidebar */}
        <div className="w-full shrink-0 border-t border-light-300 bg-light-50 p-5 dark:border-dark-300 dark:bg-dark-50 md:w-56 md:border-l md:border-t-0">
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-light-700 dark:text-dark-700">
              {t`List`}
            </p>
            <ListSelector
              cardPublicId={cardId}
              lists={formattedLists}
              isLoading={!card}
              disabled={!canEdit}
            />
          </div>
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-light-700 dark:text-dark-700">
              {t`Labels`}
            </p>
            <LabelSelector
              cardPublicId={cardId}
              labels={formattedLabels}
              isLoading={!card}
              disabled={!canEdit}
            />
          </div>
          {!isTemplate && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-light-700 dark:text-dark-700">
                {t`Members`}
              </p>
              <MemberSelector
                cardPublicId={cardId}
                members={formattedMembers}
                isLoading={!card}
                disabled={!canEdit}
              />
            </div>
          )}
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-light-700 dark:text-dark-700">
              {t`Due date`}
            </p>
            <DueDateSelector
              cardPublicId={cardId}
              dueDate={card?.dueDate}
              isLoading={!card}
              disabled={!canEdit}
            />
          </div>
        </div>
      </div>

      {/* Sub-modals (Only centered ones) */}
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
        isVisible={isOpen && (modalContentType === "NEW_LABEL" || modalContentType === "EDIT_LABEL" || modalContentType === "DELETE_LABEL" || modalContentType === "ADD_CHECKLIST")}
        className="md:hidden" // Hide on desktop since we have side-docked
      >
        {modalContentType === "NEW_LABEL" && (
          <LabelForm boardPublicId={boardId ?? ""} refetch={refetchCard} />
        )}
        {modalContentType === "EDIT_LABEL" && (
          <LabelForm boardPublicId={boardId ?? ""} refetch={refetchCard} isEdit />
        )}
        {modalContentType === "DELETE_LABEL" && (
          <DeleteLabelConfirmation refetch={refetchCard} labelPublicId={entityId} />
        )}
        {modalContentType === "ADD_CHECKLIST" && (
          <NewChecklistForm cardPublicId={cardId} />
        )}
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && !isSideDocked && modalContentType === "DELETE_CHECKLIST"}
      >
        <DeleteChecklistConfirmation
          cardPublicId={cardId}
          checklistPublicId={entityId}
        />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "EDIT_YOUTUBE"}
      >
        <EditYouTubeModal />
      </Modal>
    </div>
  );
}
