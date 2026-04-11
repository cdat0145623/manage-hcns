import { t } from "@lingui/core/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { HiXMark, HiMiniPlus } from "react-icons/hi2";

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
import CardDetailsModals from "./CardDetailsModals";
import CardMetadataGrid from "./CardMetadataGrid";
import Checklists from "./Checklists";
import Dropdown from "./Dropdown";
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

export default function CardDetailsModalContent({
  cardId,
  isTemplate,
  onClose,
}: CardDetailsModalContentProps) {
  const utils = api.useUtils();
  const { modalContentType, entityId, clearModalState, isOpen, modalStates, openModal } =
    useModal();
  const { showPopup } = usePopup();
  const { workspace } = useWorkspace();
  const { canEditCard, canAttach, canCreateComment } = usePermissions();
  const { data: session } = authClient.useSession();
  const [activeChecklistForm, setActiveChecklistForm] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"comments" | "history">(
    "comments",
  );

  const { data: card, isLoading } = api.card.byId.useQuery(
    { cardPublicId: cardId ?? "" },
    { enabled: !!cardId && cardId.length >= 12 },
  );
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
        (sl) => sl.publicId === label.publicId,
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
        (am) => am.publicId === member.publicId,
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
      ?.filter((m): m is typeof m & { email: string } => m.email !== null)
      .map((m) => ({
        publicId: m.publicId,
        email: m.email,
        user: m.user
          ? {
              id: m.user.id,
              name: m.user.name ?? null,
              image: m.user.image ?? null,
            }
          : null,
      })) ?? [];

  const updateCard = api.card.update.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to update card`,
        message: t`Please try again later.`,
        icon: "error",
      }),
    onSettled: async () => {
      if (cardId) await invalidateCard(utils, cardId);
    },
  });

  const addOrRemoveLabel = api.card.addOrRemoveLabel.useMutation({
    onError: () =>
      showPopup({
        header: t`Unable to add label`,
        message: t`Please try again later.`,
        icon: "error",
      }),
    onSettled: async () => {
      if (cardId) await utils.card.byId.invalidate({ cardPublicId: cardId });
    },
  });

  const { register, handleSubmit, setValue } = useForm<FormValues>({
    values: {
      cardId: cardId ?? "",
      title: card?.title ?? "",
      description: card?.description ?? "",
    },
  });

  const onSubmit = (values: FormValues) =>
    updateCard.mutate({
      cardPublicId: values.cardId,
      title: values.title,
      description: values.description,
    });

  useEffect(() => {
    const newLabelId = modalStates.NEW_LABEL_CREATED as string | undefined;
    if (newLabelId && cardId) {
      if (!card?.labels.some((l) => l.publicId === newLabelId))
        addOrRemoveLabel.mutate({
          cardPublicId: cardId,
          labelPublicId: newLabelId,
        });
      clearModalState("NEW_LABEL_CREATED");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalStates.NEW_LABEL_CREATED, card, cardId]);

  useEffect(() => {
    const el = document.getElementById(
      "card-modal-title",
    ) as HTMLTextAreaElement | null;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [card]);

  const { data: activitiesData } = api.card.getActivities.useQuery(
    { cardPublicId: cardId ?? "", limit: 100 },
    { enabled: !!cardId && activeTab === "comments" },
  );

  const hasComments =
    activitiesData?.activities.some((a) =>
      [
        "comment",
        "updated_comment_added",
        "updated_comment_updated",
        "updated_comment_deleted",
      ].includes(a.type),
    ) ?? false;

  if (!cardId) return null;

  const canComment = canCreateComment && card && !isTemplate;

  const canUpload = canAttach && card && !isTemplate;

  return (
    <div className="flex w-full items-center justify-center font-sans antialiased">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="flex h-[92vh] w-full overflow-hidden rounded-2xl border border-light-200 bg-white shadow-2xl dark:border-dark-300 dark:bg-dark-100"
      >
        <div className="flex w-1/2 flex-col border-r border-light-100 text-left dark:border-dark-300">
          <div className="shrink-0 border-b border-light-100 px-10 py-7 dark:border-dark-300">
            {!card && isLoading ? (
              <div className="h-10 w-3/4 animate-pulse rounded-lg bg-light-200 dark:bg-dark-300" />
            ) : card ? (
              <form onSubmit={handleSubmit(onSubmit)}>
                <textarea
                  id="card-modal-title"
                  {...register("title")}
                  onBlur={canEdit ? handleSubmit(onSubmit) : undefined}
                  rows={1}
                  disabled={!canEdit}
                  placeholder={t`Tiêu đề thẻ...`}
                  className={`block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-2xl font-bold leading-snug text-neutral-900 placeholder:text-light-400 focus:outline-none focus:ring-0 dark:text-dark-1000 dark:placeholder:text-dark-500 ${!canEdit ? "cursor-default" : ""}`}
                  onInput={(e) => {
                    const el = e.target as HTMLTextAreaElement;
                    el.style.height = "auto";
                    el.style.height = `${el.scrollHeight}px`;
                  }}
                />
              </form>
            ) : null}
          </div>
          <div className="shrink-0 border-b border-light-100 px-10 py-6 dark:border-dark-300">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
              {t`Mô tả`}
            </p>
            <div className="group relative flex min-h-[120px] w-full flex-col rounded-xl border border-light-200 bg-white shadow-sm transition-all focus-within:border-light-400 focus-within:shadow-md dark:border-dark-300 dark:bg-dark-100 dark:focus-within:border-dark-500">
              {card && (
                <form
                  className="flex flex-1 flex-col"
                  onSubmit={handleSubmit(onSubmit)}
                >
                  <Editor
                    content={card.description}
                    onChange={
                      canEdit ? (v) => setValue("description", v) : undefined
                    }
                    onBlur={
                      canEdit ? () => handleSubmit(onSubmit)() : undefined
                    }
                    workspaceMembers={
                      workspaceMembers?.filter(
                        (m): m is typeof m & { email: string } =>
                          m.email !== null,
                      ) ?? []
                    }
                    readOnly={!canEdit}
                    maxHeightClass="max-h-[250px]"
                  />
                </form>
              )}
            </div>
          </div>

          {/* Checklists */}
          <div className="flex-1 overflow-y-auto px-10 pb-10 pt-4">
            <div className="flex items-center gap-3 mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                {t`Checklist`}
              </p>
              {canEdit && cardId && (
                <button
                  onClick={() => openModal("ADD_CHECKLIST", cardId)}
                  className="flex items-center justify-center rounded-lg bg-light-100 p-1 text-neutral-600 transition-all hover:bg-light-200 hover:text-neutral-900 dark:bg-dark-300 dark:text-dark-800 dark:hover:bg-dark-400 dark:hover:text-dark-1000"
                  title="Thêm Checklist"
                >
                  <HiMiniPlus className="h-4 w-4" />
                </button>
              )}
            </div>
            {card && (
              <Checklists
                checklists={card.checklists}
                cardPublicId={cardId}
                viewOnly={!canEditCard}
                activeChecklistForm={activeChecklistForm}
                setActiveChecklistForm={setActiveChecklistForm}
              />
            )}
          </div>
        </div>
        <div className="flex w-1/2 shrink-0 flex-col overflow-hidden bg-light-50/50 text-left dark:bg-dark-50/30">
          <div className="relative z-50 flex shrink-0 items-center justify-end bg-white/50 py-4 pl-8 pr-8 backdrop-blur-sm dark:bg-dark-100/50">
            <div className="flex items-center gap-3">
              {card && (
                <div className="flex h-7 w-7 items-center justify-center rounded-xl transition-all">
                  <Dropdown
                    cardPublicId={cardId}
                    isTemplate={isTemplate}
                    boardPublicId={boardId}
                    cardCreatedBy={card.createdBy}
                  />
                </div>
              )}
              <div className="h-3 w-px bg-light-200 dark:bg-dark-300" />
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-xl text-light-950 transition-all hover:bg-light-100 hover:text-light-1000 active:scale-95 dark:text-dark-800 dark:hover:bg-dark-200 dark:hover:text-dark-1000"
              >
                <HiXMark className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-light-400 dark:scrollbar-thumb-dark-300">
            <CardMetadataGrid
              cardId={cardId}
              card={card}
              formattedLists={formattedLists}
              formattedMembers={formattedMembers}
              formattedLabels={formattedLabels}
              canEdit={!!canEdit}
              updateCard={updateCard}
              weekStartsOn={workspace.weekStartDay}
            />

            <div className="mx-6 shrink-0 border-t border-light-200 dark:border-dark-300" />
            <div className="sticky top-0 z-10 shrink-0 bg-light-50/80 px-6 py-2 backdrop-blur-md dark:bg-dark-50/80">
              <div className="relative flex rounded-2xl border border-light-200 bg-white p-1 shadow-sm dark:border-dark-300 dark:bg-dark-100">
                <button
                  onClick={() => setActiveTab("comments")}
                  className={`relative z-10 flex-1 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === "comments"
                      ? "text-neutral-900 dark:text-dark-1000"
                      : "text-light-500 hover:text-light-700 dark:text-dark-500"
                  }`}
                >
                  {t`Tính năng`}
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`relative z-10 flex-1 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === "history"
                      ? "text-neutral-900 dark:text-dark-1000"
                      : "text-light-500 hover:text-light-700 dark:text-dark-500"
                  }`}
                >
                  {t`Hoạt động`}
                </button>
                <motion.div
                  className="absolute inset-y-1 rounded-xl bg-light-100 shadow-inner dark:bg-dark-200"
                  style={{ width: "calc(50% - 4px)" }}
                  animate={{
                    x: activeTab === "comments" ? 0 : "calc(100% + 4px)",
                  }}
                  initial={false}
                  transition={{ type: "spring", stiffness: 450, damping: 38 }}
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "history" ? (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 px-6 pb-6"
                >
                  <ActivityList
                    cardPublicId={cardId}
                    isLoading={!card}
                    isAdmin={workspace.role === "ADMIN"}
                    isExpanded={true}
                    excludedTypes={[
                      "comment",
                      "updated_comment_added",
                      "updated_comment_updated",
                      "updated_comment_deleted",
                    ]}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="comments"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-1 flex-col gap-2 px-6 pb-6"
                >
                  {card && !isTemplate && (
                    <div className="shrink-0 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                          {t`Tài liệu đính kèm`}
                        </p>
                        {card.attachments.length > 0 && (
                          <span className="flex h-5 items-center justify-center rounded-full bg-light-100 px-2 text-[10px] font-bold text-light-600 dark:bg-dark-300 dark:text-dark-600">
                            {card.attachments.length}
                          </span>
                        )}
                      </div>
                      <div className="rounded-xl border border-light-200 bg-white/50 p-3 shadow-sm dark:border-dark-300 dark:bg-dark-100/50">
                        {card.attachments.length > 0 && (
                          <div className="mb-3 max-h-40 overflow-y-auto rounded-lg bg-light-50/50 p-2 dark:bg-dark-200/50">
                            <AttachmentThumbnails
                              attachments={card.attachments}
                              cardPublicId={cardId}
                              isReadOnly={!canEdit}
                            />
                          </div>
                        )}
                        <AttachmentUpload
                          cardPublicId={cardId}
                          hideChecklistButton={true}
                        />
                      </div>
                    </div>
                  )}
                  <div className="h-px bg-light-200 dark:bg-dark-300" />
                  {canComment && (
                    <div className="shrink-0 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                        {t`Viết bình luận`}
                      </p>
                      <NewCommentForm
                        cardPublicId={cardId}
                        workspaceMembers={editorWorkspaceMembers}
                      />
                    </div>
                  )}
                  {hasComments && (
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                          {t`Lịch sử bình luận`}
                        </p>
                        <div className="h-px flex-1 bg-light-200/50 dark:bg-dark-300/50" />
                      </div>
                      <div className="flex-1">
                        <ActivityList
                          cardPublicId={cardId}
                          isLoading={!card}
                          isAdmin={workspace.role === "ADMIN"}
                          includedTypes={[
                            "comment",
                            "updated_comment_added",
                            "updated_comment_updated",
                            "updated_comment_deleted",
                          ]}
                        />
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <CardDetailsModals
        isOpen={isOpen}
        modalContentType={modalContentType}
        entityId={entityId}
        boardId={boardId}
        cardId={cardId}
        refetchCard={refetchCard}
        clearModalState={clearModalState}
      />
    </div>
  );
}
