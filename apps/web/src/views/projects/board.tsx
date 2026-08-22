import type { FormEvent } from "react";
import type { DragStart, DropResult } from "react-beautiful-dnd";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";
import {
  HiBars3BottomLeft,
  HiChatBubbleLeft,
  HiEllipsisVertical,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineCog6Tooth,
  HiOutlineFlag,
  HiOutlinePaperClip,
  HiOutlinePlusSmall,
  HiOutlineUsers,
  HiXMark,
} from "react-icons/hi2";

import {
  formatInAppCalendarZone,
  isCalendarDueDateOverdueInAppZone,
} from "@kan/shared/utils";

import type { RouterOutputs } from "~/utils/api";
import Avatar from "~/components/Avatar";
import Badge from "~/components/Badge";
import Button from "~/components/Button";
import { CardCreationModalLayout } from "~/components/card-creation-modal-layout";
import CheckboxDropdown from "~/components/CheckboxDropdown";
import CircularProgress from "~/components/CircularProgress";
import Dropdown from "~/components/Dropdown";
import Editor from "~/components/Editor";
import Input from "~/components/Input";
import LabelIcon from "~/components/LabelIcon";
import Modal from "~/components/modal";
import { PageHead } from "~/components/PageHead";
import PatternedBackground from "~/components/PatternedBackground";
import Select from "~/components/Select";
import { StrictModeDroppable } from "~/components/StrictModeDroppable";
import { usePopup } from "~/providers/popup";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { getAvatarUrl } from "~/utils/helpers";
import { DueDateSelector } from "../card/components/DueDateSelector";
import ProjectCardDetailsModal from "./components/ProjectCardDetailsModal";
import ProjectLabelSettings from "./components/ProjectLabelSettings";

type ProjectBoard = RouterOutputs["projectBoard"]["byId"];
type ProjectCard = ProjectBoard["lists"][number]["cards"][number] & {
  listPublicId: string;
  depth: number;
};

const getPriorityPresentation = (priority: ProjectCard["priority"]) => {
  switch (priority) {
    case "high":
      return {
        label: t`Ưu tiên cao`,
        className: "text-red-600 dark:text-red-400",
      };
    case "low":
      return {
        label: t`Ưu tiên thấp`,
        className: "text-sky-600 dark:text-sky-400",
      };
    default:
      return {
        label: t`Ưu tiên trung bình`,
        className: "text-amber-600 dark:text-amber-400",
      };
  }
};

const getErrorMessage = (error: { message?: string }) =>
  error.message ?? t`Vui lòng thử lại sau.`;

const moveListOptimistically = (
  board: ProjectBoard,
  listPublicId: string,
  destinationIndex: number,
): ProjectBoard => {
  const sourceIndex = board.lists.findIndex(
    (list) => list.publicId === listPublicId,
  );
  if (sourceIndex < 0) return board;

  const lists = [...board.lists];
  const [movedList] = lists.splice(sourceIndex, 1);
  if (!movedList) return board;

  lists.splice(Math.min(destinationIndex, lists.length), 0, movedList);

  return {
    ...board,
    lists: lists.map((list, index) => ({ ...list, index })),
  };
};

const moveCardOptimistically = (
  board: ProjectBoard,
  cardPublicId: string,
  destinationListPublicId: string,
  destinationIndex: number,
): ProjectBoard => {
  const sourceListIndex = board.lists.findIndex((list) =>
    list.cards.some((card) => card.publicId === cardPublicId),
  );
  const destinationListIndex = board.lists.findIndex(
    (list) => list.publicId === destinationListPublicId,
  );

  if (sourceListIndex < 0 || destinationListIndex < 0) return board;

  const lists = board.lists.map((list) => ({
    ...list,
    cards: [...list.cards],
  }));
  const sourceCards = lists[sourceListIndex]?.cards;
  const destinationCards = lists[destinationListIndex]?.cards;
  if (!sourceCards || !destinationCards) return board;

  const sourceCardIndex = sourceCards.findIndex(
    (card) => card.publicId === cardPublicId,
  );
  if (sourceCardIndex < 0) return board;
  const [movedCard] = sourceCards.splice(sourceCardIndex, 1);
  if (!movedCard) return board;

  const destinationList = lists[destinationListIndex];
  const sourceList = lists[sourceListIndex];
  const nextStatus = destinationList?.isCompletionColumn
    ? "done"
    : sourceList?.isCompletionColumn
      ? "pending"
      : movedCard.status;
  const movedCardWithStatus = { ...movedCard, status: nextStatus };

  destinationCards.splice(
    Math.min(destinationIndex, destinationCards.length),
    0,
    movedCardWithStatus,
  );

  return {
    ...board,
    lists: lists.map((list) => ({
      ...list,
      cards: list.cards.map((card, index) => ({ ...card, index })),
    })),
  };
};

export default function ProjectBoardView() {
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { showPopup } = usePopup();
  const boardPublicId =
    typeof router.query.boardPublicId === "string"
      ? router.query.boardPublicId
      : "";
  const utils = api.useUtils();
  const [boardName, setBoardName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [createCardListId, setCreateCardListId] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");
  const [newCardDescription, setNewCardDescription] = useState("");
  const [newCardMemberIds, setNewCardMemberIds] = useState<string[]>([]);
  const [newCardLabelIds, setNewCardLabelIds] = useState<string[]>([]);
  const [newCardStartDate, setNewCardStartDate] = useState<Date | null>(null);
  const [newCardDueDate, setNewCardDueDate] = useState<Date | null>(null);
  const [draggedCardDimensions, setDraggedCardDimensions] = useState<{
    cardPublicId: string;
    height: number;
  } | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [workflowType, setWorkflowType] = useState<"general" | "scrum">(
    "general",
  );
  const [estimationType, setEstimationType] = useState<
    "none" | "story_points" | "hours"
  >("none");
  const [enableCycles, setEnableCycles] = useState(false);
  const [newCycleName, setNewCycleName] = useState("");
  const [newCycleGoal, setNewCycleGoal] = useState("");
  const [isPlanningSettingsOpen, setIsPlanningSettingsOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState("");
  const [isCreateColumnOpen, setIsCreateColumnOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [completionChange, setCompletionChange] = useState<{
    currentName: string;
    targetId: string;
    targetName: string;
  } | null>(null);
  const [listToDelete, setListToDelete] = useState<{
    publicId: string;
    name: string;
  } | null>(null);

  const boardQuery = api.projectBoard.byId.useQuery(
    { boardPublicId },
    { enabled: boardPublicId.length >= 12 },
  );
  const workspaceQuery = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId },
  );
  const canEdit = boardQuery.data?.permissions.canEdit ?? false;

  useEffect(() => {
    if (boardQuery.data) {
      setBoardName(boardQuery.data.name);
      setProjectCode(boardQuery.data.projectCode ?? "");
      setWorkflowType(boardQuery.data.settings.workflowType);
      setEstimationType(boardQuery.data.settings.estimationType);
      setEnableCycles(boardQuery.data.settings.enableCycles);
    }
  }, [boardQuery.data]);

  const allCards = useMemo<ProjectCard[]>(() => {
    if (!boardQuery.data) return [];

    const cards = boardQuery.data.lists.flatMap((list) =>
      list.cards.map((card) => ({
        ...card,
        listPublicId: list.publicId,
        depth: 1,
      })),
    );
    const byId = new Map(cards.map((card) => [card.publicId, card]));

    const getDepth = (
      card: ProjectCard,
      visiting = new Set<string>(),
    ): number => {
      if (!card.parentCardPublicId) return 1;
      if (visiting.has(card.publicId)) return 1;
      const parent = byId.get(card.parentCardPublicId);
      if (!parent) return 1;
      visiting.add(card.publicId);
      return Math.min(3, getDepth(parent, visiting) + 1);
    };

    return cards.map((card) => ({ ...card, depth: getDepth(card) }));
  }, [boardQuery.data]);

  const cardById = useMemo(
    () => new Map(allCards.map((card) => [card.publicId, card])),
    [allCards],
  );
  const selectedCard = selectedCardId
    ? cardById.get(selectedCardId)
    : undefined;
  const selectedCardDetail = api.projectBoard.getCard.useQuery(
    { cardPublicId: selectedCardId ?? "" },
    { enabled: !!selectedCardId },
  );

  const refreshKanban = useCallback(async () => {
    await utils.projectBoard.byId.invalidate({ boardPublicId });
  }, [boardPublicId, utils.projectBoard.byId]);

  const openCard = useCallback(
    (cardPublicId: string) => {
      setSelectedCardId(cardPublicId);
      void refreshKanban();
    },
    [refreshKanban],
  );

  const closeCard = useCallback(() => {
    setSelectedCardId(null);
    void refreshKanban();
  }, [refreshKanban]);

  useEffect(() => {
    if (!selectedCardId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCard();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCard, selectedCardId]);

  const refresh = async () => {
    await Promise.all([refreshKanban(), utils.projectBoard.all.invalidate()]);
    if (selectedCardId) {
      await utils.projectBoard.getCard.invalidate({
        cardPublicId: selectedCardId,
      });
    }
  };

  const updateBoard = api.projectBoard.update.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể cập nhật board`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const createList = api.projectBoard.createList.useMutation({
    onSuccess: async () => {
      setNewColumnName("");
      setIsCreateColumnOpen(false);
      await refresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể tạo cột`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const addBoardMember = api.projectBoard.addMember.useMutation({
    onSuccess: async () => {
      setMemberToAdd("");
      await refresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể thêm thành viên`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const updateList = api.projectBoard.updateList.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể đổi tên cột`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const reorderList = api.projectBoard.reorderList.useMutation({
    onMutate: async (variables) => {
      await utils.projectBoard.byId.cancel({ boardPublicId });
      const previousBoard = utils.projectBoard.byId.getData({ boardPublicId });
      if (previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId },
          moveListOptimistically(
            previousBoard,
            variables.listPublicId,
            variables.index,
          ),
        );
      }
      return { previousBoard };
    },
    onSuccess: refresh,
    onError: (error, _variables, context) => {
      if (context?.previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId },
          context.previousBoard,
        );
      }
      showPopup({
        header: t`Không thể sắp xếp cột`,
        message: getErrorMessage(error),
        icon: "error",
      });
    },
  });
  const createCard = api.projectBoard.createCard.useMutation({
    onSuccess: async () => {
      setCreateCardListId(null);
      setNewCardTitle("");
      setNewCardDescription("");
      setNewCardMemberIds([]);
      setNewCardLabelIds([]);
      setNewCardStartDate(null);
      setNewCardDueDate(null);
      await refresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể tạo card`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const moveCard = api.projectBoard.moveCard.useMutation({
    onMutate: async (variables) => {
      await utils.projectBoard.byId.cancel({ boardPublicId });
      const previousBoard = utils.projectBoard.byId.getData({ boardPublicId });
      if (previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId },
          moveCardOptimistically(
            previousBoard,
            variables.cardPublicId,
            variables.listPublicId,
            variables.index,
          ),
        );
      }
      return { previousBoard };
    },
    onSuccess: async () => {
      await refresh();
      setDraggedCardDimensions(null);
    },
    onError: (error, _variables, context) => {
      if (context?.previousBoard) {
        utils.projectBoard.byId.setData(
          { boardPublicId },
          context.previousBoard,
        );
      }
      showPopup({
        header: t`Không thể di chuyển card`,
        message: getErrorMessage(error),
        icon: "error",
      });
      setDraggedCardDimensions(null);
    },
  });
  const updateSettings = api.projectBoard.updateSettings.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể cập nhật planning settings`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const createCycle = api.projectBoard.createCycle.useMutation({
    onSuccess: async () => {
      setNewCycleName("");
      setNewCycleGoal("");
      await refresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể tạo cycle`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const startCycle = api.projectBoard.startCycle.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể bắt đầu cycle`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const completeCycle = api.projectBoard.completeCycle.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể hoàn tất cycle`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const setListCompletion = api.projectBoard.setListCompletion.useMutation({
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể cập nhật cột hoàn tất`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const deleteList = api.projectBoard.deleteList.useMutation({
    onSuccess: async () => {
      setListToDelete(null);
      await refresh();
    },
    onError: (error) =>
      showPopup({
        header: t`Không thể xóa cột`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const requestSetCompletion = (list: ProjectBoard["lists"][number]) => {
    if (!canEdit || list.isCompletionColumn || setListCompletion.isPending) {
      return;
    }

    const currentCompletionList = boardQuery.data?.lists.find(
      (candidate) => candidate.isCompletionColumn,
    );
    if (currentCompletionList) {
      setCompletionChange({
        currentName: currentCompletionList.name,
        targetId: list.publicId,
        targetName: list.name,
      });
      return;
    }

    setListCompletion.mutate({
      listPublicId: list.publicId,
      isCompletionColumn: true,
    });
  };
  const submitColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const name = newColumnName.trim();
    if (name && boardPublicId) createList.mutate({ boardPublicId, name });
  };

  const openCreateCardModal = (listPublicId: string) => {
    if (!canEdit || createCard.isPending) return;
    setCreateCardListId(listPublicId);
    setNewCardTitle("");
    setNewCardDescription("");
    setNewCardMemberIds([]);
    setNewCardLabelIds([]);
    setNewCardStartDate(null);
    setNewCardDueDate(null);
  };

  const closeCreateCardModal = () => {
    if (!createCard.isPending) setCreateCardListId(null);
  };

  const submitCard = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !createCardListId) return;
    const title = newCardTitle.trim();
    if (!title) return;
    createCard.mutate({
      listPublicId: createCardListId,
      title,
      description: newCardDescription.trim(),
      memberPublicIds: newCardMemberIds,
      position: "end",
      startDate: newCardStartDate,
      dueDate: newCardDueDate,
      labelPublicIds: newCardLabelIds,
    });
  };

  const onBeforeDragStart = (start: DragStart) => {
    if (start.type !== "CARD") return;
    const element = document.querySelector<HTMLElement>(
      `[data-rbd-draggable-id="${start.draggableId}"]`,
    );
    if (!element) return;
    setDraggedCardDimensions({
      cardPublicId: start.draggableId,
      height: element.getBoundingClientRect().height,
    });
  };

  const onDragEnd = (result: DropResult) => {
    if (!canEdit) {
      setDraggedCardDimensions(null);
      return;
    }
    const { destination, draggableId, type } = result;
    if (!destination) {
      setDraggedCardDimensions(null);
      return;
    }
    if (type === "LIST") {
      setDraggedCardDimensions(null);
      reorderList.mutate({
        listPublicId: draggableId,
        index: destination.index,
      });
      return;
    }
    moveCard.mutate({
      cardPublicId: draggableId,
      listPublicId: destination.droppableId,
      index: destination.index,
    });
  };

  const saveSettings = (next: {
    workflowType?: "general" | "scrum";
    estimationType?: "none" | "story_points" | "hours";
    enableCycles?: boolean;
  }) => {
    if (!canEdit || updateSettings.isPending) return;
    const nextWorkflow = next.workflowType ?? workflowType;
    const nextEstimation =
      next.estimationType ??
      (nextWorkflow === "general" && estimationType === "story_points"
        ? "none"
        : estimationType);
    const nextCycles =
      next.enableCycles ?? (nextWorkflow === "scrum" ? true : enableCycles);
    setWorkflowType(nextWorkflow);
    setEstimationType(nextEstimation);
    setEnableCycles(nextCycles);
    updateSettings.mutate({
      boardPublicId,
      workflowType: nextWorkflow,
      estimationType: nextEstimation,
      enableCycles: nextCycles,
    });
  };

  const submitCycle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const name = newCycleName.trim();
    if (!name) return;
    createCycle.mutate({
      boardPublicId,
      name,
      goal: newCycleGoal.trim() || undefined,
      startsAt: null,
      endsAt: null,
    });
  };

  const members = boardQuery.data?.members ?? [];
  const workspaceMembers = workspaceQuery.data?.members ?? [];
  const boardWorkspaceMembers = members.map((member) => member.workspaceMember);
  const newCardMemberOptions = boardWorkspaceMembers.map((member) => ({
    key: member.publicId,
    value: member.user?.name ?? member.email ?? member.publicId,
    selected: newCardMemberIds.includes(member.publicId),
    leftIcon: (
      <Avatar
        size="xs"
        name={member.user?.name ?? ""}
        email={member.user?.email ?? member.email ?? ""}
        imageUrl={
          member.user?.image ? getAvatarUrl(member.user.image) : undefined
        }
      />
    ),
  }));
  const selectedNewCardMembers = boardWorkspaceMembers.filter((member) =>
    newCardMemberIds.includes(member.publicId),
  );
  const newCardLabelOptions = (boardQuery.data?.labels ?? []).map((label) => ({
    key: label.publicId,
    value: label.name,
    selected: newCardLabelIds.includes(label.publicId),
    leftIcon: <LabelIcon colourCode={label.colourCode} />,
  }));
  const newCardEditorMembers = workspaceMembers.map((member) => ({
    publicId: member.publicId,
    email: member.email ?? "",
    user: member.user
      ? {
          id: member.publicId,
          name: member.user.name,
          image: member.user.image ?? null,
        }
      : null,
  }));

  const toggleNewCardLabel = (labelPublicId: string) => {
    const field = boardQuery.data?.labelFields.find((candidate) =>
      candidate.options.some((option) => option.publicId === labelPublicId),
    );
    if (!field) {
      setNewCardLabelIds((current) =>
        current.includes(labelPublicId)
          ? current.filter((id) => id !== labelPublicId)
          : [...current, labelPublicId],
      );
      return;
    }

    const fieldOptionIds = new Set(
      field.options.map((option) => option.publicId),
    );
    setNewCardLabelIds((current) => {
      const isSelected = current.includes(labelPublicId);
      if (field.selectionMode === "single") {
        return isSelected
          ? current.filter((id) => !fieldOptionIds.has(id))
          : [...current.filter((id) => !fieldOptionIds.has(id)), labelPublicId];
      }
      return isSelected
        ? current.filter((id) => id !== labelPublicId)
        : [...current, labelPublicId];
    });
  };

  const setNewCardLabelField = (
    field: ProjectBoard["labelFields"][number],
    labelPublicId: string,
  ) => {
    const fieldOptionIds = new Set(
      field.options.map((option) => option.publicId),
    );
    setNewCardLabelIds((current) => [
      ...current.filter((id) => !fieldOptionIds.has(id)),
      ...(labelPublicId ? [labelPublicId] : []),
    ]);
  };

  if (boardQuery.isLoading) {
    return (
      <div className="h-full animate-pulse bg-light-100 dark:bg-dark-100" />
    );
  }

  if (!boardQuery.data) {
    if (boardQuery.isError) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-light-900">
          <p>{t`Không thể tải project board.`}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void boardQuery.refetch()}
          >
            {t`Thử lại`}
          </Button>
        </div>
      );
    }
    return (
      <div className="p-8 text-sm text-light-900">{t`Không tìm thấy project board.`}</div>
    );
  }

  const board = boardQuery.data;

  return (
    <>
      <PageHead title={`${board.name} | ${workspace.name}`} />
      <div className="relative flex h-full min-h-[calc(100vh-4.5rem)] flex-col overflow-hidden">
        <PatternedBackground />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-5 py-7 md:px-8 md:py-8">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/projects")}
              className="text-base text-light-800 hover:text-neutral-900 dark:text-dark-800 dark:hover:text-dark-1000"
            >
              {t`Projects`}
            </button>
            <span className="text-base text-light-600">/</span>
            <input
              value={projectCode}
              onChange={(event) =>
                setProjectCode(event.target.value.toUpperCase())
              }
              onBlur={() => {
                if (
                  projectCode.trim() &&
                  projectCode.trim() !== board.projectCode
                ) {
                  updateBoard.mutate({
                    boardPublicId,
                    projectCode: projectCode.trim(),
                  });
                }
              }}
              className="w-20 border-0 bg-transparent p-0 text-sm font-semibold uppercase tracking-wide text-light-900 focus:ring-0 dark:text-dark-800"
              aria-label={t`Mã project`}
              title={t`Mã project dùng cho mã card`}
              disabled={!canEdit || updateBoard.isPending}
            />
            <span className="text-base text-light-600">/</span>
            <input
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              onBlur={() => {
                if (boardName.trim() && boardName.trim() !== board.name) {
                  updateBoard.mutate({ boardPublicId, name: boardName.trim() });
                }
              }}
              className="min-w-0 max-w-[520px] border-0 bg-transparent p-0 text-xl font-bold leading-8 text-neutral-900 focus:ring-0 dark:text-dark-1000"
              aria-label={t`Tên board`}
              disabled={!canEdit || updateBoard.isPending}
            />
          </div>
          <div className="flex items-center gap-3">
            {canEdit && (
              <Button
                type="button"
                size="md"
                iconLeft={<HiOutlinePlusSmall className="h-5 w-5" />}
                onClick={() => setIsCreateColumnOpen(true)}
              >
                {t`Tạo cột mới`}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="md"
              iconOnly
              iconLeft={
                <HiOutlineCog6Tooth className="h-6 w-6" aria-hidden="true" />
              }
              aria-label={t`Mở planning settings`}
              title={t`Planning settings`}
              disabled={!canEdit}
              onClick={() => setIsPlanningSettingsOpen(true)}
              className="rounded-xl !p-2 text-light-900 hover:bg-light-300 dark:text-dark-1000 dark:hover:bg-dark-300"
            />
            <Button
              type="button"
              variant="ghost"
              size="md"
              iconLeft={<HiOutlineUsers className="h-5 w-5" />}
              aria-label={t`Quản lý thành viên board`}
              title={t`Quản lý thành viên board`}
              onClick={() => setIsMembersModalOpen(true)}
              className="rounded-xl px-3 py-2 text-light-900 hover:bg-light-300 dark:text-dark-1000 dark:hover:bg-dark-300"
            >
              {members.length}
            </Button>
            {boardQuery.isFetching && (
              <span
                className="text-sm text-light-800 dark:text-dark-800"
                aria-live="polite"
              >
                {t`Đang đồng bộ…`}
              </span>
            )}
          </div>
        </div>

        {enableCycles && board.cycles.length > 0 && (
          <div className="relative z-10 px-5 py-2 md:px-6">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <HiOutlineCalendarDays className="h-4 w-4" />
              {board.cycles.map((cycle) => (
                <span
                  key={cycle.publicId}
                  className="inline-flex items-center gap-1 rounded-full bg-light-200 px-2 py-1 dark:bg-dark-300"
                >
                  {cycle.name} · {cycle.status}
                  {cycle.status === "planned" && (
                    <button
                      type="button"
                      onClick={() =>
                        startCycle.mutate({ cyclePublicId: cycle.publicId })
                      }
                      className="rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:focus-visible:ring-dark-700"
                      disabled={!canEdit || startCycle.isPending}
                    >
                      {t`Start`}
                    </button>
                  )}
                  {cycle.status === "active" && (
                    <button
                      type="button"
                      onClick={() =>
                        completeCycle.mutate({ cyclePublicId: cycle.publicId })
                      }
                      className="rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:focus-visible:ring-dark-700"
                      disabled={!canEdit || completeCycle.isPending}
                    >
                      {t`Complete`}
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        <Modal
          isVisible={isPlanningSettingsOpen}
          onClose={() => setIsPlanningSettingsOpen(false)}
          modalSize="lg"
          centered
        >
          <div className="p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
                  {t`Planning settings`}
                </h2>
                <p className="mt-1 text-sm text-light-800 dark:text-dark-800">
                  {t`Board tổng quát chỉ dùng workflow và cột. Bật Scrum khi cần cycle, backlog, estimate và báo cáo.`}
                </p>
              </div>
              <button
                type="button"
                aria-label={t`Đóng planning settings`}
                onClick={() => setIsPlanningSettingsOpen(false)}
                className="rounded p-1 text-light-800 hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:text-dark-800 dark:hover:bg-dark-300 dark:focus-visible:ring-dark-700"
              >
                <HiXMark className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs text-light-900 dark:text-dark-800">
                  {t`Workflow`}
                </span>
                <Select
                  value={workflowType}
                  onChange={(value) =>
                    saveSettings({ workflowType: value as "general" | "scrum" })
                  }
                  options={[
                    { value: "general", label: t`General` },
                    { value: "scrum", label: t`Scrum` },
                  ]}
                  disabled={!canEdit || updateSettings.isPending}
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-light-900 dark:text-dark-800">
                  {t`Estimation`}
                </span>
                <Select
                  value={estimationType}
                  onChange={(value) =>
                    saveSettings({
                      estimationType: value as
                        | "none"
                        | "story_points"
                        | "hours",
                    })
                  }
                  options={[
                    { value: "none", label: t`None` },
                    ...(workflowType === "scrum"
                      ? [{ value: "story_points", label: t`Story points` }]
                      : []),
                    { value: "hours", label: t`Hours` },
                  ]}
                  disabled={!canEdit || updateSettings.isPending}
                  className="w-full"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-light-300 px-3 py-3 dark:border-dark-300">
                <input
                  name="enableCycles"
                  type="checkbox"
                  checked={enableCycles}
                  onChange={(event) =>
                    saveSettings({ enableCycles: event.target.checked })
                  }
                  disabled={!canEdit || updateSettings.isPending}
                />
                <span>{t`Enable cycles`}</span>
              </label>
              {enableCycles && (
                <form
                  onSubmit={submitCycle}
                  className="space-y-3 rounded-lg border border-light-300 p-3 dark:border-dark-300"
                >
                  <p className="text-xs font-semibold text-light-900 dark:text-dark-800">
                    {t`Create a cycle`}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      value={newCycleName}
                      onChange={(event) => setNewCycleName(event.target.value)}
                      placeholder={t`Cycle name`}
                      name="cycleName"
                      disabled={!canEdit || createCycle.isPending}
                    />
                    <Input
                      value={newCycleGoal}
                      onChange={(event) => setNewCycleGoal(event.target.value)}
                      placeholder={t`Cycle goal`}
                      name="cycleGoal"
                      disabled={!canEdit || createCycle.isPending}
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!canEdit || createCycle.isPending}
                    isLoading={createCycle.isPending}
                  >
                    {t`Add cycle`}
                  </Button>
                </form>
              )}
              <ProjectLabelSettings
                boardPublicId={board.publicId}
                fields={board.labelFields}
                canEdit={canEdit}
                onRefresh={refresh}
              />
            </div>
            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsPlanningSettingsOpen(false)}
              >
                {t`Đóng`}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isVisible={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          modalSize="md"
          centered
        >
          <div className="p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
                  {t`Thành viên board`}
                </h2>
                <p className="mt-1 text-sm text-light-800 dark:text-dark-800">
                  {t`Quản lý những người có quyền truy cập project board này.`}
                </p>
              </div>
              <button
                type="button"
                aria-label={t`Đóng danh sách thành viên`}
                onClick={() => setIsMembersModalOpen(false)}
                className="rounded p-1 text-light-800 hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:text-dark-800 dark:hover:bg-dark-300 dark:focus-visible:ring-dark-700"
              >
                <HiXMark className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.publicId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-light-200 bg-light-50 px-3 py-2.5 dark:border-dark-300 dark:bg-dark-200"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-dark-1000">
                      {member.workspaceMember.user?.name ??
                        member.workspaceMember.email ??
                        member.workspaceMember.publicId}
                    </p>
                    {member.workspaceMember.user?.email && (
                      <p className="truncate text-xs text-light-800 dark:text-dark-800">
                        {member.workspaceMember.user.email}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-light-200 px-2 py-1 text-[11px] font-medium text-light-900 dark:bg-dark-300 dark:text-dark-800">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>

            {canEdit && (
              <form
                className="mt-5 flex gap-2 border-t border-light-200 pt-5 dark:border-dark-300"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!memberToAdd) return;
                  addBoardMember.mutate({
                    boardPublicId,
                    workspaceMemberPublicId: memberToAdd,
                    role: "editor",
                  });
                }}
              >
                <Select
                  value={memberToAdd}
                  onChange={setMemberToAdd}
                  options={[
                    { value: "", label: t`Chọn thành viên...` },
                    ...workspaceMembers
                      .filter(
                        (member) =>
                          !members.some(
                            (boardMember) =>
                              boardMember.workspaceMember.publicId ===
                              member.publicId,
                          ),
                      )
                      .map((member) => ({
                        value: member.publicId,
                        label:
                          member.user?.name ?? member.email ?? member.publicId,
                      })),
                  ]}
                  className="min-w-0 flex-1"
                  disabled={addBoardMember.isPending}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!memberToAdd || addBoardMember.isPending}
                  isLoading={addBoardMember.isPending}
                >
                  {t`Thêm`}
                </Button>
              </form>
            )}
          </div>
        </Modal>

        <Modal
          isVisible={isCreateColumnOpen}
          onClose={() => setIsCreateColumnOpen(false)}
          modalSize="sm"
          centered
        >
          <form onSubmit={submitColumn} className="p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
                  {t`Tạo cột mới`}
                </h2>
                <p className="mt-1 text-sm text-light-800 dark:text-dark-800">
                  {t`Đặt tên cho trạng thái mới của board.`}
                </p>
              </div>
              <button
                type="button"
                aria-label={t`Đóng tạo cột mới`}
                onClick={() => setIsCreateColumnOpen(false)}
                className="rounded p-1 text-light-800 hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:text-dark-800 dark:hover:bg-dark-300 dark:focus-visible:ring-dark-700"
              >
                <HiXMark className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <Input
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder={t`Tên cột mới`}
              name="newColumnName"
              autoFocus
              disabled={createList.isPending}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setIsCreateColumnOpen(false)}
              >
                {t`Hủy`}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={createList.isPending || !newColumnName.trim()}
                isLoading={createList.isPending}
              >
                {t`Tạo cột`}
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          isVisible={createCardListId !== null}
          onClose={closeCreateCardModal}
          modalSize="md"
          centered
        >
          <form onSubmit={submitCard}>
            <CardCreationModalLayout
              title={t`Thêm thẻ mới`}
              closeLabel={t`Đóng thêm thẻ mới`}
              onClose={closeCreateCardModal}
              footer={
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={closeCreateCardModal}
                    disabled={createCard.isPending}
                  >
                    {t`Hủy`}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={createCard.isPending || !newCardTitle.trim()}
                    isLoading={createCard.isPending}
                  >
                    {t`Tạo thẻ`}
                  </Button>
                </div>
              }
            >
              <p className="mb-3 text-xs text-light-800 dark:text-dark-800">
                {t`Thêm card vào cột ${board.lists.find((list) => list.publicId === createCardListId)?.name ?? ""}.`}
              </p>

              <div className="space-y-4">
                <Input
                  id="new-card-title"
                  value={newCardTitle}
                  onChange={(event) => setNewCardTitle(event.target.value)}
                  placeholder={t`Tiêu đề thẻ`}
                  name="newCardTitle"
                  autoFocus
                  disabled={createCard.isPending}
                />

                <div>
                  <div className="block max-h-48 min-h-24 w-full overflow-y-auto rounded-md border-0 bg-dark-300 bg-white/5 px-3 py-2 text-sm shadow-sm ring-1 ring-inset ring-light-600 focus-within:ring-2 focus-within:ring-inset focus-within:ring-light-700 dark:ring-dark-700 dark:focus-within:ring-dark-700">
                    <Editor
                      content={newCardDescription}
                      onChange={setNewCardDescription}
                      workspaceMembers={newCardEditorMembers}
                      enableYouTubeEmbed={false}
                      placeholder={t`Mô tả`}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                      {t`Cột`}
                    </span>
                    <Select
                      value={createCardListId ?? ""}
                      onChange={setCreateCardListId}
                      options={board.lists.map((list) => ({
                        value: list.publicId,
                        label: list.name,
                      }))}
                      disabled={createCard.isPending}
                      title={t`Chọn cột`}
                      buttonClassName="!min-h-[42px] !rounded-xl !border-light-300 !px-3 !py-2 dark:!border-dark-300/50"
                    />
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                      {t`Thành viên`}
                    </span>
                    <CheckboxDropdown
                      items={newCardMemberOptions}
                      handleSelect={(_groupKey, item) => {
                        setNewCardMemberIds((current) =>
                          current.includes(item.key)
                            ? current.filter(
                                (memberId) => memberId !== item.key,
                              )
                            : [...current, item.key],
                        );
                      }}
                      disabled={createCard.isPending}
                      asChild
                    >
                      <div className="flex min-h-[42px] w-full items-center rounded-xl bg-white px-3 py-2 text-left text-sm font-medium text-neutral-900 shadow-sm ring-1 ring-light-300 transition-colors hover:bg-light-50 hover:ring-light-400 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50">
                        {selectedNewCardMembers.length > 0 ? (
                          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                            {selectedNewCardMembers.map((member) => {
                              const name =
                                member.user?.name ??
                                member.email ??
                                member.publicId;
                              return (
                                <span
                                  key={member.publicId}
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-light-100 px-2 py-1 text-xs font-medium text-neutral-900 dark:bg-dark-300 dark:text-dark-1000"
                                  title={name}
                                >
                                  <Avatar
                                    size="xs"
                                    name={member.user?.name ?? ""}
                                    email={
                                      member.user?.email ?? member.email ?? ""
                                    }
                                    imageUrl={
                                      member.user?.image
                                        ? getAvatarUrl(member.user.image)
                                        : undefined
                                    }
                                  />
                                  <span className="max-w-[12rem] truncate">
                                    {name}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          t`Chọn thành viên`
                        )}
                      </div>
                    </CheckboxDropdown>
                  </div>

                  {board.labelFields.length > 0
                    ? board.labelFields.map((field) => {
                        const fieldOptionIds = new Set(
                          field.options.map((option) => option.publicId),
                        );
                        const selectedOptionIds = newCardLabelIds.filter((id) =>
                          fieldOptionIds.has(id),
                        );
                        const fieldLabel = (
                          <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                            {field.name}
                          </span>
                        );

                        if (field.selectionMode === "single") {
                          return (
                            <div key={field.publicId} className="min-w-0">
                              {fieldLabel}
                              <Select
                                value={selectedOptionIds[0] ?? ""}
                                onChange={(labelPublicId) =>
                                  setNewCardLabelField(field, labelPublicId)
                                }
                                options={[
                                  { value: "", label: t`Chưa chọn` },
                                  ...field.options.map((option) => ({
                                    value: option.publicId,
                                    label: option.name,
                                  })),
                                ]}
                                disabled={createCard.isPending}
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
                          leftIcon: (
                            <LabelIcon colourCode={option.colourCode} />
                          ),
                        }));
                        return (
                          <div key={field.publicId} className="min-w-0">
                            {fieldLabel}
                            <CheckboxDropdown
                              items={items}
                              handleSelect={(_, option) =>
                                toggleNewCardLabel(option.key)
                              }
                              disabled={createCard.isPending}
                              asChild
                            >
                              <div className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm ring-1 ring-light-300 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50">
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
                    : newCardLabelOptions.length > 0 && (
                        <div className="min-w-0">
                          <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                            {t`Nhãn`}
                          </span>
                          <CheckboxDropdown
                            items={newCardLabelOptions}
                            handleSelect={(_groupKey, item) =>
                              toggleNewCardLabel(item.key)
                            }
                            disabled={createCard.isPending}
                            asChild
                          >
                            <div className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm ring-1 ring-light-300 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50">
                              {newCardLabelIds.length
                                ? newCardLabelOptions
                                    .filter((option) =>
                                      newCardLabelIds.includes(option.key),
                                    )
                                    .map((option) => (
                                      <span
                                        key={option.key}
                                        className="inline-flex items-center gap-1 rounded-md bg-light-100 px-2 py-1 text-xs dark:bg-dark-300"
                                      >
                                        {option.leftIcon}
                                        {option.value}
                                      </span>
                                    ))
                                : t`Thêm nhãn`}
                            </div>
                          </CheckboxDropdown>
                        </div>
                      )}

                  <div className="min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                      {t`Bắt đầu`}
                    </span>
                    <DueDateSelector
                      cardPublicId={createCardListId ?? ""}
                      dueDate={newCardStartDate}
                      disabled={createCard.isPending}
                      weekStartsOn={workspace.weekStartDay}
                      label={t`Bắt đầu`}
                      title={t`Chọn ngày bắt đầu`}
                      className="!min-h-[42px] !rounded-xl !px-3 !py-2"
                      onDateSelect={(date) => setNewCardStartDate(date ?? null)}
                    />
                  </div>

                  <div className="min-w-0">
                    <span className="mb-1 block truncate text-[10px] font-semibold uppercase tracking-widest text-light-900 dark:text-dark-800">
                      {t`Hạn chót`}
                    </span>
                    <DueDateSelector
                      cardPublicId={createCardListId ?? ""}
                      dueDate={newCardDueDate}
                      disabled={createCard.isPending}
                      weekStartsOn={workspace.weekStartDay}
                      label={t`Hạn chót`}
                      title={t`Chọn hạn chót`}
                      className="!min-h-[42px] !rounded-xl !px-3 !py-2"
                      onDateSelect={(date) => setNewCardDueDate(date ?? null)}
                    />
                  </div>
                </div>
              </div>
            </CardCreationModalLayout>
          </form>
        </Modal>

        <Modal
          isVisible={completionChange !== null}
          onClose={() => {
            if (!setListCompletion.isPending) setCompletionChange(null);
          }}
          modalSize="sm"
          centered
        >
          {completionChange && (
            <div className="p-6">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
                {t`Đổi cột hoàn thành?`}
              </h2>
              <p className="mt-2 text-sm leading-6 text-light-900 dark:text-dark-800">
                {t`Bạn có muốn đổi cột hoàn thành từ ${completionChange.currentName} sang ${completionChange.targetName} không?`}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setCompletionChange(null)}
                  disabled={setListCompletion.isPending}
                >
                  {t`Hủy`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  isLoading={setListCompletion.isPending}
                  onClick={() => {
                    setListCompletion.mutate(
                      {
                        listPublicId: completionChange.targetId,
                        isCompletionColumn: true,
                      },
                      { onSuccess: () => setCompletionChange(null) },
                    );
                  }}
                >
                  {t`Đổi cột`}
                </Button>
              </div>
            </div>
          )}
        </Modal>

        <Modal
          isVisible={listToDelete !== null}
          onClose={() => {
            if (!deleteList.isPending) setListToDelete(null);
          }}
          modalSize="sm"
          centered
        >
          {listToDelete && (
            <div className="p-6">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
                {t`Xóa cột?`}
              </h2>
              <p className="mt-2 text-sm leading-6 text-light-900 dark:text-dark-800">
                {t`Bạn có chắc muốn xóa cột ${listToDelete.name} không? Các card trong cột cũng sẽ bị xóa.`}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setListToDelete(null)}
                  disabled={deleteList.isPending}
                >
                  {t`Hủy`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  isLoading={deleteList.isPending}
                  onClick={() => {
                    deleteList.mutate({
                      listPublicId: listToDelete.publicId,
                    });
                  }}
                >
                  {t`Xóa cột`}
                </Button>
              </div>
            </div>
          )}
        </Modal>

        <div className="relative z-10 flex min-h-0 flex-1 overflow-x-auto p-5 md:p-6">
          <DragDropContext
            onBeforeDragStart={onBeforeDragStart}
            onDragEnd={onDragEnd}
          >
            <Droppable
              droppableId="project-lists"
              direction="horizontal"
              type="LIST"
            >
              {(listProvided) => (
                <div
                  ref={listProvided.innerRef}
                  {...listProvided.droppableProps}
                  className="flex"
                >
                  {board.lists.map((list, listIndex) => (
                    <Draggable
                      key={list.publicId}
                      draggableId={list.publicId}
                      index={listIndex}
                      isDragDisabled={!canEdit}
                    >
                      {(listDraggable) => (
                        <div
                          ref={listDraggable.innerRef}
                          {...listDraggable.draggableProps}
                          className="mr-4 flex h-fit max-h-[calc(100vh-170px)] w-[18rem] shrink-0 flex-col rounded-md border border-light-400 bg-light-300 py-2 pl-2 pr-1 dark:border-dark-300 dark:bg-dark-100"
                        >
                          <div
                            {...listDraggable.dragHandleProps}
                            className="mb-2 flex items-center gap-2"
                          >
                            {editingListId === list.publicId ? (
                              <input
                                defaultValue={list.name}
                                autoFocus
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (canEdit && value && value !== list.name) {
                                    updateList.mutate({
                                      listPublicId: list.publicId,
                                      name: value,
                                    });
                                  }
                                  setEditingListId(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    setEditingListId(null);
                                  } else if (event.key === "Enter") {
                                    event.currentTarget.blur();
                                  }
                                }}
                                className="min-w-0 flex-1 border-0 bg-transparent px-2 pt-1 text-sm font-medium text-neutral-900 focus:ring-0 dark:text-dark-1000"
                                aria-label={t`Tên cột`}
                                disabled={updateList.isPending}
                              />
                            ) : (
                              <span className="min-w-0 flex-1 truncate px-2 pt-1 text-sm font-medium text-neutral-900 dark:text-dark-1000">
                                {list.name}
                              </span>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                aria-label={t`Thêm card`}
                                title={t`Thêm card`}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() =>
                                  openCreateCardModal(list.publicId)
                                }
                                disabled={createCard.isPending}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-light-800 hover:bg-light-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-dark-800 dark:hover:bg-dark-200 dark:focus-visible:ring-dark-700"
                              >
                                <HiOutlinePlusSmall
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              </button>
                            )}
                            <span className="rounded-full bg-light-200 px-2 py-0.5 text-xs text-light-900 dark:bg-dark-300 dark:text-dark-800">
                              {list.cards.length}
                            </span>
                            {list.isCompletionColumn && (
                              <HiOutlineCheckCircle
                                className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                                aria-label={t`Cột hoàn thành`}
                                title={t`Cột hoàn thành`}
                              />
                            )}
                            {canEdit && (
                              <div
                                className="mr-1 shrink-0"
                                onMouseDown={(event) => event.stopPropagation()}
                              >
                                <Dropdown
                                  buttonLabel={t`Thao tác với cột`}
                                  items={[
                                    {
                                      label: t`Thêm card`,
                                      action: () =>
                                        openCreateCardModal(list.publicId),
                                      icon: (
                                        <HiOutlinePlusSmall className="h-4 w-4" />
                                      ),
                                    },
                                    {
                                      label: t`Đổi tên cột`,
                                      action: () =>
                                        setEditingListId(list.publicId),
                                    },
                                    {
                                      label: t`Đặt làm cột hoàn thành`,
                                      action: () => requestSetCompletion(list),
                                      disabled:
                                        list.isCompletionColumn ||
                                        setListCompletion.isPending,
                                    },
                                    {
                                      label: t`Xóa cột`,
                                      action: () =>
                                        setListToDelete({
                                          publicId: list.publicId,
                                          name: list.name,
                                        }),
                                    },
                                  ]}
                                >
                                  <HiEllipsisVertical
                                    className="h-5 w-5 text-light-800 dark:text-dark-800"
                                    aria-hidden="true"
                                  />
                                </Dropdown>
                              </div>
                            )}
                          </div>
                          <StrictModeDroppable
                            droppableId={list.publicId}
                            type="CARD"
                          >
                            {(cardProvided) => (
                              <div
                                ref={cardProvided.innerRef}
                                {...cardProvided.droppableProps}
                                className="scrollbar-w-[6px] min-h-8 space-y-2 overflow-y-auto pr-1 scrollbar scrollbar-thumb-light-400 dark:scrollbar-thumb-dark-500"
                              >
                                {list.cards.map((card, cardIndex) => {
                                  const priority = getPriorityPresentation(
                                    card.priority,
                                  );
                                  return (
                                    <Draggable
                                      key={card.publicId}
                                      draggableId={card.publicId}
                                      index={cardIndex}
                                      isDragDisabled={!canEdit}
                                    >
                                      {(cardDraggable) => (
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          aria-label={card.title}
                                          ref={cardDraggable.innerRef}
                                          {...cardDraggable.draggableProps}
                                          {...cardDraggable.dragHandleProps}
                                          onClick={() =>
                                            openCard(card.publicId)
                                          }
                                          onKeyDown={(event) => {
                                            if (
                                              event.key === "Enter" ||
                                              event.key === " "
                                            ) {
                                              event.preventDefault();
                                              openCard(card.publicId);
                                            }
                                          }}
                                          style={{
                                            ...cardDraggable.draggableProps
                                              .style,
                                            ...(draggedCardDimensions?.cardPublicId ===
                                            card.publicId
                                              ? {
                                                  height: `${draggedCardDimensions.height}px`,
                                                }
                                              : {}),
                                          }}
                                          className={`min-h-[72px] w-[calc(100%-0px)] cursor-grab touch-manipulation select-none rounded-md border border-light-200 bg-light-50 px-3 py-2 text-left text-sm text-neutral-900 shadow-sm transition-colors hover:border-light-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 active:cursor-grabbing dark:border-dark-400 dark:bg-dark-200 dark:text-dark-1000 dark:focus-visible:ring-dark-700 ${card.status === "done" ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}
                                        >
                                          <span className="block break-words leading-5">
                                            {card.title}
                                          </span>
                                          {card.labels.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                              {card.labels.map((label) => (
                                                <Badge
                                                  key={label.publicId}
                                                  value={label.name}
                                                  iconLeft={
                                                    <LabelIcon
                                                      colourCode={
                                                        label.colourCode
                                                      }
                                                    />
                                                  }
                                                />
                                              ))}
                                            </div>
                                          )}
                                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-light-800 dark:text-dark-800">
                                            <div className="flex min-w-0 items-center gap-2">
                                              <HiOutlineFlag
                                                className={`h-3.5 w-3.5 shrink-0 ${priority.className}`}
                                                aria-label={priority.label}
                                                title={priority.label}
                                              />
                                              {card.description && (
                                                <HiBars3BottomLeft
                                                  className="h-3.5 w-3.5 shrink-0"
                                                  aria-label={t`Có mô tả`}
                                                />
                                              )}
                                              {(card.startDate ??
                                                card.dueDate) && (
                                                <span
                                                  className={`flex min-w-0 items-center gap-1 ${card.dueDate && isCalendarDueDateOverdueInAppZone(card.dueDate) && card.status !== "done" ? "text-red-600 dark:text-red-400" : card.status === "done" ? "text-emerald-600 dark:text-emerald-400" : ""}`}
                                                >
                                                  <HiOutlineClock className="h-3.5 w-3.5 shrink-0" />
                                                  <span className="truncate">
                                                    {card.startDate &&
                                                      formatInAppCalendarZone(
                                                        card.startDate,
                                                        "MMM dd",
                                                      )}
                                                    {card.startDate &&
                                                      card.dueDate &&
                                                      " - "}
                                                    {card.dueDate &&
                                                      formatInAppCalendarZone(
                                                        card.dueDate,
                                                        "MMM dd",
                                                      )}
                                                  </span>
                                                </span>
                                              )}
                                              {card.status === "done" && (
                                                <HiOutlineCheckCircle
                                                  className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                                                  aria-label={t`Đã hoàn thành`}
                                                />
                                              )}
                                              {card.comments.length > 0 && (
                                                <HiChatBubbleLeft
                                                  className="h-3.5 w-3.5 shrink-0"
                                                  aria-label={t`Có bình luận`}
                                                />
                                              )}
                                              {card.attachments.length > 0 && (
                                                <HiOutlinePaperClip
                                                  className="h-3.5 w-3.5 shrink-0"
                                                  aria-label={t`Có tài liệu đính kèm`}
                                                />
                                              )}
                                            </div>
                                            <div className="flex shrink-0 items-center gap-1">
                                              {card.checklists.length > 0 && (
                                                <div className="flex items-center gap-1 rounded-full border border-light-300 px-1.5 py-0.5 dark:border-dark-600">
                                                  <CircularProgress
                                                    progress={(() => {
                                                      const total =
                                                        card.checklists.reduce(
                                                          (sum, checklist) =>
                                                            sum +
                                                            checklist.items
                                                              .length,
                                                          0,
                                                        );
                                                      const completed =
                                                        card.checklists.reduce(
                                                          (sum, checklist) =>
                                                            sum +
                                                            checklist.items.filter(
                                                              (item) =>
                                                                item.completed,
                                                            ).length,
                                                          0,
                                                        );
                                                      return total > 0
                                                        ? (completed / total) *
                                                            100
                                                        : 2;
                                                    })()}
                                                    size="sm"
                                                    className="flex-shrink-0"
                                                  />
                                                  <span className="text-[10px]">
                                                    {card.checklists.reduce(
                                                      (sum, checklist) =>
                                                        sum +
                                                        checklist.items.filter(
                                                          (item) =>
                                                            item.completed,
                                                        ).length,
                                                      0,
                                                    )}
                                                    /
                                                    {card.checklists.reduce(
                                                      (sum, checklist) =>
                                                        sum +
                                                        checklist.items.length,
                                                      0,
                                                    )}
                                                  </span>
                                                </div>
                                              )}
                                              {card.parentCardPublicId &&
                                                cardById.get(
                                                  card.parentCardPublicId,
                                                )?.code && (
                                                  <span className="rounded-full border border-light-400 px-1.5 py-0.5 text-[10px] font-semibold text-light-900 dark:border-dark-600 dark:text-dark-800">
                                                    {
                                                      cardById.get(
                                                        card.parentCardPublicId,
                                                      )?.code
                                                    }
                                                  </span>
                                                )}
                                              {card.members.length > 0 && (
                                                <div className="isolate flex -space-x-1 overflow-hidden pl-1">
                                                  {card.members
                                                    .slice(0, 3)
                                                    .map((member) => (
                                                      <Avatar
                                                        key={member.publicId}
                                                        name={
                                                          member.user?.name ??
                                                          ""
                                                        }
                                                        email={
                                                          member.user?.email ??
                                                          member.email ??
                                                          ""
                                                        }
                                                        imageUrl={
                                                          member.user?.image
                                                            ? getAvatarUrl(
                                                                member.user
                                                                  .image,
                                                              )
                                                            : undefined
                                                        }
                                                        size="xs"
                                                      />
                                                    ))}
                                                  {card.members.length > 3 && (
                                                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-light-200 px-1 text-[9px] font-semibold dark:bg-dark-400">
                                                      +{card.members.length - 3}
                                                    </span>
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          {card.code && (
                                            <div className="mt-1 flex">
                                              <span className="inline-flex items-center rounded-full border border-light-400 bg-light-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-light-900 dark:border-dark-600 dark:bg-dark-300 dark:text-dark-800">
                                                {card.code}
                                              </span>
                                            </div>
                                          )}
                                          {(card.cyclePublicId ??
                                            card.estimateValue != null) && (
                                            <span className="mt-1 block text-[11px] text-light-800 dark:text-dark-800">
                                              {card.cyclePublicId
                                                ? (board.cycles.find(
                                                    (cycle) =>
                                                      cycle.publicId ===
                                                      card.cyclePublicId,
                                                  )?.name ?? t`Cycle`)
                                                : t`Backlog`}
                                              {card.estimateValue != null &&
                                                ` · ${card.estimateValue} ${estimationType === "hours" ? t`giờ` : t`điểm`}`}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {cardProvided.placeholder}
                              </div>
                            )}
                          </StrictModeDroppable>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {listProvided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        </div>

        {selectedCard && (
          <ProjectCardDetailsModal
            key={selectedCard.publicId}
            board={board}
            card={selectedCard}
            cardDetail={selectedCardDetail.data}
            allCards={allCards}
            members={members}
            workspaceMembers={workspaceMembers}
            canEdit={canEdit}
            workflowType={workflowType}
            enableCycles={enableCycles}
            weekStartsOn={workspace.weekStartDay}
            isAdmin={workspace.role === "ADMIN"}
            isOpen={true}
            onClose={closeCard}
            onOpenCard={openCard}
            onRefresh={refresh}
          />
        )}
      </div>
    </>
  );
}
