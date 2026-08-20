import type { FormEvent } from "react";
import { t } from "@lingui/core/macro";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  HiEllipsisVertical,
  HiMiniPlus,
  HiOutlineArrowPath,
  HiOutlineCalendarDays,
  HiOutlinePlusSmall,
  HiOutlineTrash,
  HiXMark,
} from "react-icons/hi2";

import { formatInAppCalendarZone } from "@kan/shared/utils";

import type { RouterOutputs } from "~/utils/api";
import Badge from "~/components/Badge";
import Button from "~/components/Button";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import Dropdown from "~/components/Dropdown";
import Editor from "~/components/Editor";
import Input from "~/components/Input";
import LabelIcon from "~/components/LabelIcon";
import Modal from "~/components/modal";
import Select from "~/components/Select";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import ActivityList from "../../card/components/ActivityList";
import { AttachmentThumbnails } from "../../card/components/AttachmentThumbnails";
import { AttachmentUpload } from "../../card/components/AttachmentUpload";
import Checklists from "../../card/components/Checklists";
import { DeleteChecklistConfirmation } from "../../card/components/DeleteChecklistConfirmation";
import { DueDateSelector } from "../../card/components/DueDateSelector";
import { NewChecklistForm } from "../../card/components/NewChecklistForm";
import NewCommentForm from "../../card/components/NewCommentForm";

type ProjectBoard = RouterOutputs["projectBoard"]["byId"];
type ProjectCard = ProjectBoard["lists"][number]["cards"][number] & {
  listPublicId: string;
  depth: number;
};
type ProjectCardDetail = RouterOutputs["projectBoard"]["getCard"];
type ProjectCardLabel = ProjectCard["labels"][number];
interface WorkspaceMember {
  publicId: string;
  email: string | null;
  user: {
    id?: string;
    name: string | null;
    email?: string | null;
  } | null;
}

const MAX_BREADCRUMB_TITLE_LENGTH = 30;
const INFO_FIELD_LABEL_CLASS =
  "mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800";

const truncateBreadcrumbTitle = (title: string) =>
  title.length > MAX_BREADCRUMB_TITLE_LENGTH
    ? `${title.slice(0, MAX_BREADCRUMB_TITLE_LENGTH - 1)}…`
    : title;

const getBreadcrumbLabel = (card: Pick<ProjectCard, "code" | "title">) =>
  `${card.code ? `${card.code} - ` : ""}${truncateBreadcrumbTitle(card.title)}`;

const updateBoardCardLabels = (
  board: ProjectBoard,
  cardPublicId: string,
  labels: ProjectCardLabel[],
): ProjectBoard => ({
  ...board,
  lists: board.lists.map((list) => ({
    ...list,
    cards: list.cards.map((listCard) =>
      listCard.publicId === cardPublicId ? { ...listCard, labels } : listCard,
    ),
  })),
});

interface ProjectCardDetailsModalProps {
  board: ProjectBoard;
  card: ProjectCard;
  cardDetail: ProjectCardDetail | undefined;
  allCards: ProjectCard[];
  members: ProjectBoard["members"];
  workspaceMembers: WorkspaceMember[];
  canEdit: boolean;
  enableCycles: boolean;
  estimationType: "none" | "story_points" | "hours";
  weekStartsOn: 0 | 1 | 6;
  isAdmin: boolean;
  isOpen: boolean;
  onClose: () => void;
  onOpenCard: (cardPublicId: string) => void;
  onRefresh: () => Promise<void>;
}

const getErrorMessage = (error: { message?: string }) =>
  error.message ?? t`Vui lòng thử lại sau.`;

export default function ProjectCardDetailsModal({
  board,
  card,
  cardDetail,
  allCards,
  members,
  workspaceMembers,
  canEdit,
  enableCycles,
  estimationType,
  weekStartsOn,
  isAdmin,
  isOpen,
  onClose,
  onOpenCard,
  onRefresh,
}: ProjectCardDetailsModalProps) {
  const { entityId, modalContentType, openModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? "");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [selectedEstimate, setSelectedEstimate] = useState("");
  const [childTitle, setChildTitle] = useState("");
  const [activeTab, setActiveTab] = useState<"features" | "activity">(
    "features",
  );
  const [activeChecklistForm, setActiveChecklistForm] = useState<string | null>(
    null,
  );
  const [isParentSelectorOpen, setIsParentSelectorOpen] = useState(false);
  const [selectedParentCardId, setSelectedParentCardId] = useState(
    card.parentCardPublicId ?? "",
  );

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description ?? "");
    setSelectedMemberIds(card.members.map((member) => member.publicId));
    setSelectedCycleId(card.cyclePublicId ?? null);
    setSelectedEstimate(
      card.estimateValue == null ? "" : String(card.estimateValue),
    );
    // Keep draft fields stable while the board cache refreshes after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.publicId]);

  const updateCard = api.projectBoard.updateCard.useMutation({
    onSuccess: async (_data, variables) => {
      if (variables.description !== undefined) {
        const description = variables.description;
        utils.projectBoard.byId.setData(
          { boardPublicId: board.publicId },
          (currentBoard) => {
            if (!currentBoard) return currentBoard;
            return {
              ...currentBoard,
              lists: currentBoard.lists.map((list) => ({
                ...list,
                cards: list.cards.map((listCard) =>
                  listCard.publicId === card.publicId
                    ? { ...listCard, description }
                    : listCard,
                ),
              })),
            };
          },
        );
        utils.projectBoard.getCard.setData(
          { cardPublicId: card.publicId },
          (currentCard) =>
            currentCard ? { ...currentCard, description } : currentCard,
        );
        return;
      }

      await onRefresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể cập nhật card`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const createCard = api.projectBoard.createCard.useMutation({
    onSuccess: async () => {
      setChildTitle("");
      await onRefresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể tạo công việc con`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const setCardMembers = api.projectBoard.setCardMembers.useMutation({
    onSuccess: onRefresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể gán thành viên`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const setCardPlanning = api.projectBoard.setCardPlanning.useMutation({
    onSuccess: onRefresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể cập nhật planning card`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const moveCard = api.projectBoard.moveCard.useMutation({
    onSuccess: onRefresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể chuyển card`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const toggleCardLabel = api.projectBoard.toggleCardLabel.useMutation({
    onMutate: async (variables) => {
      await Promise.all([
        utils.projectBoard.byId.cancel({ boardPublicId: board.publicId }),
        utils.projectBoard.getCard.cancel({ cardPublicId: card.publicId }),
      ]);
      const previousBoard = utils.projectBoard.byId.getData({
        boardPublicId: board.publicId,
      });
      const previousCard = utils.projectBoard.getCard.getData({
        cardPublicId: card.publicId,
      });
      const currentBoardCard = previousBoard?.lists
        .flatMap((list) => list.cards)
        .find((listCard) => listCard.publicId === card.publicId);
      const currentLabels =
        previousCard?.labels ?? currentBoardCard?.labels ?? card.labels;
      const label =
        previousBoard?.labels.find(
          (boardLabel) => boardLabel.publicId === variables.labelPublicId,
        ) ??
        board.labels.find(
          (boardLabel) => boardLabel.publicId === variables.labelPublicId,
        );
      if (label) {
        const isSelected = currentLabels.some(
          (currentLabel) => currentLabel.publicId === label.publicId,
        );
        const nextLabels = isSelected
          ? currentLabels.filter(
              (currentLabel) => currentLabel.publicId !== label.publicId,
            )
          : [...currentLabels, label];
        if (previousBoard) {
          utils.projectBoard.byId.setData(
            { boardPublicId: board.publicId },
            updateBoardCardLabels(previousBoard, card.publicId, nextLabels),
          );
        }
        utils.projectBoard.getCard.setData(
          { cardPublicId: card.publicId },
          (currentCard) =>
            currentCard ? { ...currentCard, labels: nextLabels } : currentCard,
        );
      }
      return { previousBoard, previousCard };
    },
    onSuccess: onRefresh,
    onError: (error, _variables, context) => {
      if (context?.previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId: board.publicId },
          context.previousBoard,
        );
      }
      if (context?.previousCard) {
        utils.projectBoard.getCard.setData(
          { cardPublicId: card.publicId },
          context.previousCard,
        );
      }
      showPopup({
        header: t`Không thể cập nhật nhãn`,
        message: getErrorMessage(error),
        icon: "error",
      });
    },
  });
  const setCardLabelOptions = api.projectBoard.setCardLabelOptions.useMutation({
    onMutate: async (variables) => {
      await Promise.all([
        utils.projectBoard.byId.cancel({ boardPublicId: board.publicId }),
        utils.projectBoard.getCard.cancel({ cardPublicId: card.publicId }),
      ]);
      const previousBoard = utils.projectBoard.byId.getData({
        boardPublicId: board.publicId,
      });
      const previousCard = utils.projectBoard.getCard.getData({
        cardPublicId: card.publicId,
      });
      const field =
        previousBoard?.labelFields.find(
          (labelField) => labelField.publicId === variables.fieldPublicId,
        ) ??
        board.labelFields.find(
          (labelField) => labelField.publicId === variables.fieldPublicId,
        );
      const currentBoardCard = previousBoard?.lists
        .flatMap((list) => list.cards)
        .find((listCard) => listCard.publicId === card.publicId);
      const currentLabels =
        previousCard?.labels ?? currentBoardCard?.labels ?? card.labels;
      const fieldOptionIds = new Set(
        field?.options.map((option) => option.publicId) ?? [],
      );
      const nextLabels = [
        ...currentLabels.filter(
          (currentLabel) => !fieldOptionIds.has(currentLabel.publicId),
        ),
        ...(field?.options.filter((option) =>
          variables.optionPublicIds.includes(option.publicId),
        ) ?? []),
      ];
      if (previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId: board.publicId },
          updateBoardCardLabels(previousBoard, card.publicId, nextLabels),
        );
      }
      utils.projectBoard.getCard.setData(
        { cardPublicId: card.publicId },
        (currentCard) =>
          currentCard ? { ...currentCard, labels: nextLabels } : currentCard,
      );
      return { previousBoard, previousCard };
    },
    onSuccess: onRefresh,
    onError: (error, _variables, context) => {
      if (context?.previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId: board.publicId },
          context.previousBoard,
        );
      }
      if (context?.previousCard) {
        utils.projectBoard.getCard.setData(
          { cardPublicId: card.publicId },
          context.previousCard,
        );
      }
      showPopup({
        header: t`Không thể cập nhật nhãn card`,
        message: getErrorMessage(error),
        icon: "error",
      });
    },
  });
  const deleteCard = api.projectBoard.deleteCard.useMutation({
    onSuccess: async () => {
      onClose();
      await onRefresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể xóa card`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const saveTitle = () => {
    if (!canEdit || !title.trim() || title.trim() === card.title) return;
    updateCard.mutate({ cardPublicId: card.publicId, title: title.trim() });
  };

  const submitChild = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const childName = childTitle.trim();
    if (!canEdit || !childName) return;
    createCard.mutate({
      listPublicId: card.listPublicId,
      parentCardPublicId: card.publicId,
      title: childName,
      description: "",
      memberPublicIds: [],
      position: "end",
    });
  };

  const memberOptions = members.map((member) => ({
    key: member.workspaceMember.publicId,
    value:
      member.workspaceMember.user?.name ??
      member.workspaceMember.email ??
      member.workspaceMember.publicId,
    selected: selectedMemberIds.includes(member.workspaceMember.publicId),
  }));
  const cardsById = new Map(allCards.map((item) => [item.publicId, item]));
  const ancestorCards: ProjectCard[] = [];
  const visitedCardIds = new Set([card.publicId]);
  let ancestorPublicId = card.parentCardPublicId;

  while (ancestorPublicId && !visitedCardIds.has(ancestorPublicId)) {
    const ancestor = cardsById.get(ancestorPublicId);
    if (!ancestor) break;
    ancestorCards.unshift(ancestor);
    visitedCardIds.add(ancestor.publicId);
    ancestorPublicId = ancestor.parentCardPublicId;
  }

  const isDescendantOfCurrent = (candidate: ProjectCard) => {
    const visitedIds = new Set<string>();
    let candidateParentId = candidate.parentCardPublicId;

    while (candidateParentId && !visitedIds.has(candidateParentId)) {
      if (candidateParentId === card.publicId) return true;
      visitedIds.add(candidateParentId);
      candidateParentId =
        cardsById.get(candidateParentId)?.parentCardPublicId ?? null;
    }

    return false;
  };

  const parentCardOptions = [
    { value: "", label: t`Không có card cha` },
    ...allCards
      .filter(
        (item) =>
          item.publicId !== card.publicId && !isDescendantOfCurrent(item),
      )
      .map((item) => ({
        value: item.publicId,
        label: `${t`Cấp`} ${item.depth} · ${item.title}`,
      })),
  ];

  const editorWorkspaceMembers = workspaceMembers.flatMap((member) => {
    const email = member.email;
    const userId = member.user?.id;
    if (!email || !userId) return [];
    return [
      {
        publicId: member.publicId,
        email,
        user: {
          id: userId,
          name: member.user?.name ?? null,
          image: null,
        },
      },
    ];
  });
  const selectedLabels = new Set(
    (cardDetail?.labels ?? []).map((label) => label.publicId),
  );
  const labelOptions = board.labels.map((label) => ({
    key: label.publicId,
    value: label.name,
    selected: selectedLabels.has(label.publicId),
    leftIcon: <LabelIcon colourCode={label.colourCode} />,
  }));
  const selectedLabelIds = new Set(
    (cardDetail?.labels ?? []).map((label) => label.publicId),
  );
  const hasComments = activeTab === "features";

  return (
    <Modal isVisible={isOpen} onClose={onClose} modalSize="project" centered>
      <div className="flex h-[96vh] max-h-[96vh] min-h-[min(820px,96vh)] flex-col overflow-hidden rounded-2xl">
        <div className="grid min-h-0 flex-1 md:grid-cols-[1.1fr_0.9fr]">
          <div className="min-h-0 overflow-y-auto border-b border-light-200 p-6 dark:border-dark-300 md:border-b-0 md:border-r md:p-8">
            <div className="space-y-5">
              <nav
                aria-label={t`Đường dẫn card`}
                className="flex min-w-0 items-center gap-1 text-xs text-light-800 dark:text-dark-800"
              >
                {ancestorCards.length === 0 ? (
                  canEdit ? (
                    <button
                      type="button"
                      title={t`Thêm card cha`}
                      onClick={() => {
                        setSelectedParentCardId(card.parentCardPublicId ?? "");
                        setIsParentSelectorOpen(true);
                      }}
                      className="shrink-0 rounded px-1 py-0.5 text-left transition-colors hover:bg-light-200 hover:text-light-1000 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:hover:bg-dark-300 dark:hover:text-dark-1000 dark:focus-visible:ring-dark-700"
                    >
                      {t`Thêm card cha`}
                    </button>
                  ) : (
                    <span className="shrink-0">{t`Thêm card cha`}</span>
                  )
                ) : (
                  ancestorCards.map((ancestor, index) => (
                    <span
                      key={ancestor.publicId}
                      className="flex min-w-0 items-center gap-1"
                    >
                      {index > 0 && <span aria-hidden="true">/</span>}
                      <button
                        type="button"
                        title={`${ancestor.code ? `${ancestor.code} - ` : ""}${ancestor.title}`}
                        onClick={() => onOpenCard(ancestor.publicId)}
                        className="max-w-[14rem] truncate rounded px-1 py-0.5 text-left transition-colors hover:bg-light-200 hover:text-light-1000 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:hover:bg-dark-300 dark:hover:text-dark-1000 dark:focus-visible:ring-dark-700"
                      >
                        {getBreadcrumbLabel(ancestor)}
                      </button>
                    </span>
                  ))
                )}
                <span aria-hidden="true">/</span>
                <button
                  type="button"
                  title={title}
                  aria-current="page"
                  onClick={() => onOpenCard(card.publicId)}
                  className="min-w-0 max-w-[14rem] truncate rounded px-1 py-0.5 text-left font-semibold text-neutral-900 transition-colors hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:text-dark-1000 dark:hover:bg-dark-300 dark:focus-visible:ring-dark-700"
                >
                  {truncateBreadcrumbTitle(title)}
                </button>
              </nav>
              <label className="block border-b border-light-200 pb-5 dark:border-dark-300">
                <span className="sr-only">{t`Tiêu đề card`}</span>
                <Input
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onBlur={saveTitle}
                  disabled={!canEdit || updateCard.isPending}
                  className="!bg-transparent !px-0 !text-2xl !font-bold !shadow-none !ring-0"
                />
              </label>
              <div className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                  {t`Mô tả`}
                </span>
                <div className="overflow-hidden rounded-xl border border-light-300 bg-white shadow-sm dark:border-dark-300/50 dark:bg-dark-300/30">
                  <Editor
                    content={description}
                    onChange={setDescription}
                    onBlur={() => {
                      if (canEdit && description !== (card.description ?? "")) {
                        updateCard.mutate({
                          cardPublicId: card.publicId,
                          description,
                        });
                      }
                    }}
                    workspaceMembers={editorWorkspaceMembers}
                    readOnly={!canEdit || updateCard.isPending}
                    placeholder={t`Mô tả card…`}
                    maxHeightClass="max-h-64"
                  />
                </div>
              </div>
            </div>

            <section className="mt-8 border-t border-light-200 pt-6 dark:border-dark-300">
              <div className="mb-3 flex items-center gap-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                  {t`Checklist`}
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openModal("ADD_CHECKLIST", card.publicId)}
                    className="flex items-center justify-center rounded-lg bg-light-100 p-1 text-neutral-600 transition-all hover:bg-light-200 hover:text-neutral-900 dark:bg-dark-300 dark:text-dark-800 dark:hover:bg-dark-400 dark:hover:text-dark-1000"
                    title={t`Thêm Checklist`}
                  >
                    <HiMiniPlus className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Checklists
                checklists={cardDetail?.checklists ?? []}
                cardPublicId={card.publicId}
                activeChecklistForm={activeChecklistForm}
                setActiveChecklistForm={setActiveChecklistForm}
                onChanged={onRefresh}
                viewOnly={!canEdit}
              />
              {!cardDetail?.checklists.length && (
                <p className="text-sm text-light-800 dark:text-dark-800">
                  {t`Chưa có checklist.`}
                </p>
              )}
            </section>

            <section className="mt-8 border-t border-light-200 pt-6 dark:border-dark-300">
              <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                {t`Công việc con`}
              </h3>
              {cardDetail ? (
                cardDetail.children.length ? (
                  <div className="space-y-2">
                    {cardDetail.children.map((child) => (
                      <button
                        key={child.publicId}
                        type="button"
                        onClick={() => onOpenCard(child.publicId)}
                        className="block w-full rounded-xl border border-light-200 bg-white px-3 py-2 text-left text-sm text-neutral-900 transition-colors hover:bg-light-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:border-dark-300 dark:bg-dark-200 dark:text-dark-1000 dark:hover:bg-dark-300 dark:focus-visible:ring-dark-700"
                      >
                        <div className="flex items-start gap-2">
                          {child.code && (
                            <span className="shrink-0 text-xs font-semibold tracking-wide text-light-900 dark:text-dark-800">
                              {child.code}
                            </span>
                          )}
                          <span className="min-w-0 break-words font-medium">
                            {child.title}
                          </span>
                        </div>
                        {child.labels.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {child.labels.map((label) => (
                              <Badge
                                key={label.publicId}
                                value={label.name}
                                iconLeft={
                                  <LabelIcon colourCode={label.colourCode} />
                                }
                              />
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          <span
                            className={`rounded-full px-2 py-0.5 font-medium ${child.status === "done" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : child.status === "missed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"}`}
                          >
                            {child.status === "done"
                              ? t`Đã hoàn thành`
                              : child.status === "missed"
                                ? t`Đã bỏ lỡ`
                                : t`Đang thực hiện`}
                          </span>
                          {child.dueDate && (
                            <span className="flex items-center gap-1 text-light-800 dark:text-dark-800">
                              <HiOutlineCalendarDays className="h-3.5 w-3.5" />
                              {formatInAppCalendarZone(
                                child.dueDate,
                                "MMM dd, yyyy",
                              )}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-light-800 dark:text-dark-800">
                    {t`Chưa có công việc con.`}
                  </p>
                )
              ) : (
                <p className="text-sm text-light-800 dark:text-dark-800">
                  {t`Đang tải…`}
                </p>
              )}
              {canEdit && card.depth < 3 && (
                <form onSubmit={submitChild} className="mt-3 flex gap-2">
                  <Input
                    name="childTitle"
                    value={childTitle}
                    onChange={(event) => setChildTitle(event.target.value)}
                    placeholder={t`Tên công việc con…`}
                    className="min-w-0 flex-1"
                    disabled={createCard.isPending}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="ghost"
                    iconOnly
                    iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
                    aria-label={t`Tạo công việc con`}
                    disabled={createCard.isPending}
                    isLoading={createCard.isPending}
                    className="text-light-900 hover:bg-light-300 dark:text-dark-1000 dark:hover:bg-dark-300"
                  />
                </form>
              )}
            </section>
          </div>

          <div className="flex min-h-0 flex-col bg-light-50/60 dark:bg-dark-50/30">
            <div className="flex w-full shrink-0 items-center justify-end bg-light-50/60 px-6 pb-2 pt-6 dark:bg-dark-50/30 md:px-8 md:pt-8">
              <div className="flex items-center gap-2">
                {canEdit && (
                  <button
                    type="button"
                    disabled={updateCard.isPending}
                    onClick={() =>
                      updateCard.mutate({
                        cardPublicId: card.publicId,
                        status:
                          (cardDetail?.status ?? card.status) === "done"
                            ? "pending"
                            : "done",
                      })
                    }
                    className={`flex min-h-[42px] items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium shadow-sm ring-1 transition-all ${
                      (cardDetail?.status ?? card.status) === "done"
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 dark:ring-emerald-700/50"
                        : "bg-white text-neutral-900 ring-light-300 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-current">
                      {(cardDetail?.status ?? card.status) === "done" && "✓"}
                    </span>
                    {(cardDetail?.status ?? card.status) === "done"
                      ? t`Đã hoàn thành`
                      : t`Hoàn thành`}
                  </button>
                )}
                {canEdit && (
                  <Dropdown
                    disabled={deleteCard.isPending}
                    items={[
                      {
                        label: t`Đổi công việc cha`,
                        icon: <HiOutlineArrowPath className="h-4 w-4" />,
                        action: () => {
                          setSelectedParentCardId(
                            card.parentCardPublicId ?? "",
                          );
                          setIsParentSelectorOpen(true);
                        },
                      },
                      {
                        label: t`Xóa card`,
                        icon: <HiOutlineTrash className="h-4 w-4" />,
                        action: () => {
                          if (
                            window.confirm(
                              t`Bạn có chắc muốn xóa card này không?`,
                            )
                          ) {
                            deleteCard.mutate({ cardPublicId: card.publicId });
                          }
                        },
                      },
                    ]}
                  >
                    <span className="sr-only">{t`Tùy chọn card`}</span>
                    <HiEllipsisVertical
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </Dropdown>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t`Đóng chi tiết card`}
                  className="rounded-xl p-2 text-light-800 transition-colors hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:text-dark-800 dark:hover:bg-dark-300 dark:focus-visible:ring-dark-700"
                >
                  <HiXMark className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 md:px-8 md:py-6">
              <section>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="min-w-0">
                    <span className={INFO_FIELD_LABEL_CLASS}>
                      {t`Danh sách`}
                    </span>
                    <Select
                      value={cardDetail?.list.publicId ?? card.listPublicId}
                      onChange={(value) => {
                        if (!value || value === card.listPublicId) return;
                        moveCard.mutate({
                          cardPublicId: card.publicId,
                          listPublicId: value,
                          index:
                            board.lists.find((list) => list.publicId === value)
                              ?.cards.length ?? 0,
                        });
                      }}
                      options={board.lists.map((list) => ({
                        value: list.publicId,
                        label: list.name,
                      }))}
                      disabled={!canEdit || moveCard.isPending}
                      title={t`Chọn danh sách`}
                      buttonClassName="!min-h-[42px] !rounded-xl !border-light-300 !px-3 !py-2 dark:!border-dark-300/50"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className={INFO_FIELD_LABEL_CLASS}>
                      {t`Thành viên`}
                    </span>
                    <CheckboxDropdown
                      items={memberOptions}
                      handleSelect={(_, member) => {
                        const nextMemberIds = selectedMemberIds.includes(
                          member.key,
                        )
                          ? selectedMemberIds.filter((id) => id !== member.key)
                          : [...selectedMemberIds, member.key];
                        setSelectedMemberIds(nextMemberIds);
                        setCardMembers.mutate({
                          cardPublicId: card.publicId,
                          memberPublicIds: nextMemberIds,
                        });
                      }}
                      disabled={!canEdit || setCardMembers.isPending}
                      asChild
                    >
                      <div
                        title={t`Chọn thành viên`}
                        className={`flex min-h-[42px] w-full items-center rounded-xl bg-white px-3 py-2 text-left text-sm font-medium text-neutral-900 shadow-sm ring-1 ring-light-300 transition-colors hover:bg-light-50 hover:ring-light-400 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50 ${!canEdit ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                      >
                        {selectedMemberIds.length > 0
                          ? `${selectedMemberIds.length} ${t`thành viên đã chọn`}`
                          : t`Chọn thành viên`}
                      </div>
                    </CheckboxDropdown>
                  </div>
                  {board.labelFields.length > 0 ? (
                    board.labelFields.map((field) => {
                      const selectedOptionIds = field.options
                        .filter((option) =>
                          selectedLabelIds.has(option.publicId),
                        )
                        .map((option) => option.publicId);
                      const fieldLabel = (
                        <span className={INFO_FIELD_LABEL_CLASS}>
                          {field.name}
                        </span>
                      );
                      if (field.selectionMode === "single") {
                        return (
                          <div key={field.publicId} className="min-w-0">
                            {fieldLabel}
                            <Select
                              value={selectedOptionIds[0] ?? ""}
                              onChange={(optionPublicId) =>
                                setCardLabelOptions.mutate({
                                  cardPublicId: card.publicId,
                                  fieldPublicId: field.publicId,
                                  optionPublicIds: optionPublicId
                                    ? [optionPublicId]
                                    : [],
                                })
                              }
                              options={[
                                { value: "", label: t`Chưa chọn` },
                                ...field.options.map((option) => ({
                                  value: option.publicId,
                                  label: option.name,
                                })),
                              ]}
                              disabled={
                                !canEdit || setCardLabelOptions.isPending
                              }
                              title={t`Chọn ${field.name}`}
                              buttonClassName="!min-h-[42px] !rounded-xl !border-light-300 !px-3 !py-2 dark:!border-dark-300/50"
                            />
                          </div>
                        );
                      }
                      const items = field.options.map((option) => ({
                        key: option.publicId,
                        value: option.name,
                        selected: selectedOptionIds.includes(option.publicId),
                        leftIcon: <LabelIcon colourCode={option.colourCode} />,
                      }));
                      return (
                        <div key={field.publicId} className="min-w-0">
                          {fieldLabel}
                          <CheckboxDropdown
                            items={items}
                            handleSelect={(_, option) => {
                              const nextOptionIds = selectedOptionIds.includes(
                                option.key,
                              )
                                ? selectedOptionIds.filter(
                                    (id) => id !== option.key,
                                  )
                                : [...selectedOptionIds, option.key];
                              setCardLabelOptions.mutate({
                                cardPublicId: card.publicId,
                                fieldPublicId: field.publicId,
                                optionPublicIds: nextOptionIds,
                              });
                            }}
                            disabled={!canEdit || setCardLabelOptions.isPending}
                            asChild
                          >
                            <div
                              title={t`Chọn ${field.name}`}
                              className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm ring-1 ring-light-300 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50"
                            >
                              {selectedOptionIds.length
                                ? field.options
                                    .filter((option) =>
                                      selectedOptionIds.includes(
                                        option.publicId,
                                      ),
                                    )
                                    .map((option) => (
                                      <span
                                        key={option.publicId}
                                        className="inline-flex items-center gap-1 rounded-md bg-light-100 px-2 py-1 text-xs dark:bg-dark-300"
                                      >
                                        <LabelIcon
                                          colourCode={option.colourCode}
                                        />
                                        {option.name}
                                      </span>
                                    ))
                                : t`Thêm nhãn`}
                            </div>
                          </CheckboxDropdown>
                        </div>
                      );
                    })
                  ) : (
                    <div className="min-w-0">
                      <span className={INFO_FIELD_LABEL_CLASS}>{t`Nhãn`}</span>
                      <CheckboxDropdown
                        items={labelOptions}
                        handleSelect={(_, label) =>
                          toggleCardLabel.mutate({
                            cardPublicId: card.publicId,
                            labelPublicId: label.key,
                          })
                        }
                        disabled={!canEdit || toggleCardLabel.isPending}
                        asChild
                      >
                        <div
                          title={t`Chọn nhãn`}
                          className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm ring-1 ring-light-300 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50"
                        >
                          {cardDetail?.labels.length
                            ? cardDetail.labels.map((label) => (
                                <span
                                  key={label.publicId}
                                  className="inline-flex items-center gap-1 rounded-md bg-light-100 px-2 py-1 text-xs dark:bg-dark-300"
                                >
                                  <LabelIcon colourCode={label.colourCode} />
                                  {label.name}
                                </span>
                              ))
                            : t`Thêm nhãn`}
                        </div>
                      </CheckboxDropdown>
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className={INFO_FIELD_LABEL_CLASS}>{t`Bắt đầu`}</span>
                    <DueDateSelector
                      cardPublicId={card.publicId}
                      dueDate={cardDetail?.startDate}
                      disabled={!canEdit}
                      weekStartsOn={weekStartsOn}
                      label={t`Bắt đầu`}
                      title={t`Chọn ngày bắt đầu`}
                      className="!min-h-[42px] !rounded-xl !px-3 !py-2"
                      onDateSelect={(date) =>
                        updateCard.mutate({
                          cardPublicId: card.publicId,
                          startDate: date ?? null,
                        })
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <span className={INFO_FIELD_LABEL_CLASS}>{t`Hết hạn`}</span>
                    <DueDateSelector
                      cardPublicId={card.publicId}
                      dueDate={cardDetail?.dueDate}
                      disabled={!canEdit}
                      weekStartsOn={weekStartsOn}
                      label={t`Hết hạn`}
                      title={t`Chọn ngày hết hạn`}
                      className="!min-h-[42px] !rounded-xl !px-3 !py-2"
                      onDateSelect={(date) =>
                        updateCard.mutate({
                          cardPublicId: card.publicId,
                          dueDate: date ?? null,
                        })
                      }
                    />
                  </div>
                </div>
              </section>

              {(enableCycles || estimationType !== "none") && (
                <section>
                  <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                    {t`Planning card`}
                  </h3>
                  {enableCycles && (
                    <div>
                      <span className={INFO_FIELD_LABEL_CLASS}>{t`Cycle`}</span>
                      <Select
                        value={selectedCycleId ?? ""}
                        onChange={(value) => setSelectedCycleId(value || null)}
                        options={[
                          { value: "", label: t`Backlog` },
                          ...board.cycles
                            .filter((cycle) => cycle.status !== "completed")
                            .map((cycle) => ({
                              value: cycle.publicId,
                              label: `${cycle.name} · ${cycle.status}`,
                            })),
                        ]}
                        disabled={!canEdit || setCardPlanning.isPending}
                        title={t`Chọn cycle`}
                        className="mb-3 w-full"
                      />
                    </div>
                  )}
                  {estimationType !== "none" && (
                    <div>
                      <span className={INFO_FIELD_LABEL_CLASS}>
                        {t`Estimate`}
                      </span>
                      <Input
                        name="estimateValue"
                        type="number"
                        min={estimationType === "hours" ? 0.01 : 0}
                        step={estimationType === "hours" ? 0.25 : 1}
                        value={selectedEstimate}
                        onChange={(event) =>
                          setSelectedEstimate(event.target.value)
                        }
                        title={t`Nhập estimate`}
                        disabled={!canEdit || setCardPlanning.isPending}
                        placeholder={
                          estimationType === "hours"
                            ? t`Estimate in hours`
                            : t`Story points`
                        }
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    disabled={!canEdit || setCardPlanning.isPending}
                    isLoading={setCardPlanning.isPending}
                    onClick={() =>
                      setCardPlanning.mutate({
                        cardPublicId: card.publicId,
                        cyclePublicId: selectedCycleId,
                        estimateValue:
                          selectedEstimate.trim() === ""
                            ? null
                            : Number(selectedEstimate),
                      })
                    }
                  >
                    {t`Save planning`}
                  </Button>
                </section>
              )}

              <section className="mt-7 border-t border-light-200 pt-6 dark:border-dark-300">
                <div className="relative mb-4 flex rounded-2xl border border-light-200 bg-white p-1 shadow-sm dark:border-dark-300 dark:bg-dark-100">
                  <button
                    type="button"
                    onClick={() => setActiveTab("features")}
                    className={`relative z-10 flex-1 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === "features" ? "text-neutral-900 dark:text-dark-1000" : "text-light-500 hover:text-light-700 dark:text-dark-500"}`}
                  >
                    {t`Tính năng`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("activity")}
                    className={`relative z-10 flex-1 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === "activity" ? "text-neutral-900 dark:text-dark-1000" : "text-light-500 hover:text-light-700 dark:text-dark-500"}`}
                  >
                    {t`Hoạt động`}
                  </button>
                  <motion.div
                    className="absolute inset-y-1 rounded-xl bg-light-100 shadow-inner dark:bg-dark-200"
                    style={{ width: "calc(50% - 4px)" }}
                    animate={{
                      x: activeTab === "features" ? 0 : "calc(100% + 4px)",
                    }}
                    initial={false}
                    transition={{ type: "spring", stiffness: 450, damping: 38 }}
                  />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  {hasComments ? (
                    <motion.div
                      key="features"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <section className="mb-6 border-b border-light-200 pb-6 dark:border-dark-300">
                        <div className="mb-3 flex items-center justify-between">
                          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                            {t`Tài liệu đính kèm`}
                          </h3>
                          {cardDetail?.attachments.length ? (
                            <span className="rounded-full bg-light-100 px-2 py-1 text-[10px] font-bold text-light-700 dark:bg-dark-300 dark:text-dark-700">
                              {cardDetail.attachments.length}
                            </span>
                          ) : null}
                        </div>
                        <AttachmentThumbnails
                          attachments={cardDetail?.attachments}
                          cardPublicId={card.publicId}
                          isReadOnly={!canEdit}
                          onChanged={onRefresh}
                        />
                        {canEdit && (
                          <AttachmentUpload
                            cardPublicId={card.publicId}
                            hideChecklistButton={true}
                            onUploaded={onRefresh}
                          />
                        )}
                      </section>
                      {canEdit && editorWorkspaceMembers.length > 0 && (
                        <NewCommentForm
                          cardPublicId={card.publicId}
                          workspaceMembers={editorWorkspaceMembers}
                          onSuccess={onRefresh}
                        />
                      )}
                      <ActivityList
                        cardPublicId={card.publicId}
                        isLoading={!cardDetail}
                        isAdmin={isAdmin}
                        isViewOnly={!canEdit}
                        isExpanded={true}
                        includedTypes={[
                          "comment",
                          "updated_comment_added",
                          "updated_comment_updated",
                          "updated_comment_deleted",
                        ]}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="activity"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                    >
                      <ActivityList
                        cardPublicId={card.publicId}
                        isLoading={!cardDetail}
                        isAdmin={isAdmin}
                        isViewOnly={!canEdit}
                        isExpanded={true}
                        excludedTypes={[
                          "comment",
                          "updated_comment_added",
                          "updated_comment_updated",
                          "updated_comment_deleted",
                        ]}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
          </div>
        </div>
      </div>
      <Modal
        modalSize="sm"
        centered
        isVisible={isOpen && modalContentType === "ADD_CHECKLIST"}
      >
        <NewChecklistForm
          cardPublicId={card.publicId}
          onSuccess={() => void onRefresh()}
        />
      </Modal>
      <Modal
        modalSize="sm"
        centered
        isVisible={isParentSelectorOpen}
        onClose={() => setIsParentSelectorOpen(false)}
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
            {card.parentCardPublicId ? t`Đổi công việc cha` : t`Thêm card cha`}
          </h2>
          <p className="mt-1 text-sm text-light-800 dark:text-dark-800">
            {t`Chọn card cha cho card hiện tại.`}
          </p>
          <div className="mt-5">
            <Select
              value={selectedParentCardId}
              onChange={setSelectedParentCardId}
              options={parentCardOptions}
              disabled={!canEdit || updateCard.isPending}
              title={t`Chọn card cha`}
              className="w-full"
            />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsParentSelectorOpen(false)}
              disabled={updateCard.isPending}
            >
              {t`Hủy`}
            </Button>
            <Button
              type="button"
              disabled={!canEdit || updateCard.isPending}
              isLoading={updateCard.isPending}
              onClick={() =>
                updateCard.mutate(
                  {
                    cardPublicId: card.publicId,
                    parentCardPublicId: selectedParentCardId || null,
                  },
                  {
                    onSuccess: () => setIsParentSelectorOpen(false),
                  },
                )
              }
            >
              {t`OK`}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        modalSize="sm"
        centered
        isVisible={
          isOpen && modalContentType === "DELETE_CHECKLIST" && Boolean(entityId)
        }
      >
        <DeleteChecklistConfirmation
          cardPublicId={card.publicId}
          checklistPublicId={entityId}
          onChanged={onRefresh}
        />
      </Modal>
    </Modal>
  );
}
