import type { FormEvent } from "react";
import type { DropResult } from "react-beautiful-dnd";
import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";
import {
  HiBars3BottomLeft,
  HiChatBubbleLeft,
  HiOutlineCalendarDays,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlineCog6Tooth,
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
import CircularProgress from "~/components/CircularProgress";
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
import ProjectCardDetailsModal from "./components/ProjectCardDetailsModal";
import ProjectLabelSettings from "./components/ProjectLabelSettings";

type ProjectBoard = RouterOutputs["projectBoard"]["byId"];
type ProjectCard = ProjectBoard["lists"][number]["cards"][number] & {
  listPublicId: string;
  depth: number;
};

const getErrorMessage = (error: { message?: string }) =>
  error.message ?? t`Vui lòng thử lại sau.`;

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
  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>(
    {},
  );
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

  const boardQuery = api.projectBoard.byId.useQuery(
    { boardPublicId },
    { enabled: boardPublicId.length >= 12 },
  );
  const workspaceQuery = api.workspace.byId.useQuery(
    { workspacePublicId: workspace.publicId },
    { enabled: !!workspace.publicId },
  );
  const scrumReport = api.projectBoard.scrumReport.useQuery(
    { boardPublicId },
    {
      enabled: boardQuery.data?.settings.workflowType === "scrum",
    },
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

  useEffect(() => {
    if (!selectedCardId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedCardId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCardId]);

  const refresh = async () => {
    await Promise.all([
      utils.projectBoard.byId.invalidate({ boardPublicId }),
      utils.projectBoard.all.invalidate(),
    ]);
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
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể sắp xếp cột`,
        message: getErrorMessage(error),
        icon: "error",
      }),
  });
  const createCard = api.projectBoard.createCard.useMutation({
    onSuccess: async (_, variables) => {
      setNewCardTitles((current) => ({
        ...current,
        [variables.listPublicId]: "",
      }));
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
    onSuccess: refresh,
    onError: (error) =>
      showPopup({
        header: t`Không thể di chuyển card`,
        message: getErrorMessage(error),
        icon: "error",
      }),
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
  const submitColumn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;
    const name = newColumnName.trim();
    if (name && boardPublicId) createList.mutate({ boardPublicId, name });
  };

  const submitCard = (
    event: FormEvent<HTMLFormElement>,
    listPublicId: string,
  ) => {
    event.preventDefault();
    if (!canEdit) return;
    const title = newCardTitles[listPublicId]?.trim();
    if (!title) return;
    createCard.mutate({
      listPublicId,
      title,
      description: "",
      memberPublicIds: [],
      position: "end",
    });
  };

  const onDragEnd = (result: DropResult) => {
    if (!canEdit) return;
    const { destination, draggableId, type } = result;
    if (!destination) return;
    if (type === "LIST") {
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

        {workflowType === "scrum" && scrumReport.data && (
          <div className="relative z-10 grid gap-3 border-b border-light-300 bg-light-50/60 px-5 py-3 text-sm dark:border-dark-300 dark:bg-dark-100/60 md:grid-cols-3 md:px-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-light-900 dark:text-dark-800">
                {t`Current cycle`}
              </div>
              <div className="mt-1 font-semibold text-neutral-900 dark:text-dark-1000">
                {scrumReport.data.cycle?.name ?? t`No active cycle`}
              </div>
              <div className="text-xs text-light-800 dark:text-dark-800">
                {scrumReport.data.cycle?.status ?? t`Backlog only`}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-light-900 dark:text-dark-800">
                {t`Burndown snapshot`}
              </div>
              <div className="mt-1 font-semibold text-neutral-900 dark:text-dark-1000">
                {scrumReport.data.burndown.remainingCards} /{" "}
                {scrumReport.data.burndown.totalCards} {t`cards remaining`}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-light-300 dark:bg-dark-400">
                <div
                  className="h-full rounded-full bg-green-500"
                  style={{
                    width: `${scrumReport.data.burndown.totalCards > 0 ? Math.round((scrumReport.data.burndown.completedCards / scrumReport.data.burndown.totalCards) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-light-900 dark:text-dark-800">
                {t`Velocity`}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-xs text-light-900 dark:text-dark-800">
                {scrumReport.data.velocity.length > 0
                  ? scrumReport.data.velocity.map((cycle) => (
                      <span
                        key={cycle.publicId}
                        className="rounded-full bg-light-200 px-2 py-1 dark:bg-dark-300"
                      >
                        {cycle.name}: {cycle.completedEstimate}
                      </span>
                    ))
                  : t`No completed cycles`}
              </div>
            </div>
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 overflow-x-auto p-5 md:p-6">
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable
              droppableId="project-lists"
              direction="horizontal"
              type="LIST"
            >
              {(listProvided) => (
                <div
                  ref={listProvided.innerRef}
                  {...listProvided.droppableProps}
                  className="flex gap-4"
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
                          className="flex h-fit max-h-[calc(100vh-170px)] w-[18rem] shrink-0 flex-col rounded-md border border-light-400 bg-light-300 py-2 pl-2 pr-1 dark:border-dark-300 dark:bg-dark-100"
                        >
                          <div
                            {...listDraggable.dragHandleProps}
                            className="mb-2 flex items-center gap-2"
                          >
                            <input
                              defaultValue={list.name}
                              onBlur={(event) => {
                                const value = event.target.value.trim();
                                if (canEdit && value && value !== list.name) {
                                  updateList.mutate({
                                    listPublicId: list.publicId,
                                    name: value,
                                  });
                                }
                              }}
                              className="min-w-0 flex-1 border-0 bg-transparent px-2 pt-1 text-sm font-medium text-neutral-900 focus:ring-0 dark:text-dark-1000"
                              aria-label={t`Tên cột`}
                              disabled={!canEdit || updateList.isPending}
                            />
                            <span className="rounded-full bg-light-200 px-2 py-0.5 text-xs text-light-900 dark:bg-dark-300 dark:text-dark-800">
                              {list.cards.length}
                            </span>
                            {workflowType === "scrum" && (
                              <button
                                type="button"
                                onClick={() =>
                                  canEdit &&
                                  setListCompletion.mutate({
                                    listPublicId: list.publicId,
                                    isCompletionColumn:
                                      !list.isCompletionColumn,
                                  })
                                }
                                className={`rounded px-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 dark:focus-visible:ring-dark-700 ${list.isCompletionColumn ? "bg-green-200 text-green-900" : "text-light-800"}`}
                                title={t`Completion column`}
                                aria-label={
                                  list.isCompletionColumn
                                    ? t`Bỏ đánh dấu cột hoàn tất`
                                    : t`Đánh dấu cột hoàn tất`
                                }
                                disabled={
                                  !canEdit || setListCompletion.isPending
                                }
                              >
                                ✓
                              </button>
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
                                            setSelectedCardId(card.publicId)
                                          }
                                          onKeyDown={(event) => {
                                            if (
                                              event.key === "Enter" ||
                                              event.key === " "
                                            ) {
                                              event.preventDefault();
                                              setSelectedCardId(card.publicId);
                                            }
                                          }}
                                          style={{
                                            ...cardDraggable.draggableProps
                                              .style,
                                          }}
                                          className={`min-h-[72px] w-[calc(100%-0px)] cursor-grab touch-manipulation select-none rounded-md border border-light-200 bg-light-50 px-3 py-2 text-left text-sm text-neutral-900 shadow-sm transition-colors hover:border-light-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-700 active:cursor-grabbing dark:border-dark-400 dark:bg-dark-200 dark:text-dark-1000 dark:focus-visible:ring-dark-700 ${card.status === "done" ? "bg-emerald-50 dark:bg-emerald-900/20" : ""}`}
                                        >
                                          <div className="flex items-start gap-2">
                                            {card.code && (
                                              <span className="shrink-0 pt-0.5 text-[10px] font-semibold tracking-wide text-light-800 dark:text-dark-700">
                                                {card.code}
                                              </span>
                                            )}
                                            <span className="min-w-0 break-words leading-5">
                                              {card.title}
                                            </span>
                                          </div>
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
                          {canEdit && (
                            <form
                              onSubmit={(event) =>
                                submitCard(event, list.publicId)
                              }
                              className="mt-3 flex gap-2"
                            >
                              <Input
                                value={newCardTitles[list.publicId] ?? ""}
                                onChange={(event) =>
                                  setNewCardTitles((current) => ({
                                    ...current,
                                    [list.publicId]: event.target.value,
                                  }))
                                }
                                placeholder={t`Thêm card...`}
                                className="min-w-0 flex-1"
                                name={`newCard-${list.publicId}`}
                                disabled={createCard.isPending}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant="ghost"
                                iconOnly
                                iconLeft={
                                  <HiOutlinePlusSmall className="h-4 w-4" />
                                }
                                aria-label={t`Thêm card`}
                                disabled={createCard.isPending}
                                isLoading={createCard.isPending}
                                className="text-light-900 hover:bg-light-300 dark:text-dark-1000 dark:hover:bg-dark-300"
                              />
                            </form>
                          )}
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
            enableCycles={enableCycles}
            estimationType={estimationType}
            weekStartsOn={workspace.weekStartDay}
            isAdmin={workspace.role === "ADMIN"}
            isOpen={true}
            onClose={() => setSelectedCardId(null)}
            onOpenCard={setSelectedCardId}
            onRefresh={refresh}
          />
        )}
      </div>
    </>
  );
}
