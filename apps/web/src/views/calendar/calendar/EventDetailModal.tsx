import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { HiMiniPlus, HiXMark } from "react-icons/hi2";

import { authClient } from "@kan/auth/client";

import type { EditableEntry } from "./CreateEventModal";
import Editor, { type WorkspaceMember } from "~/components/Editor";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import Modal from "../../../components/modal";
import ActivityList from "../../card/components/ActivityList";
import { AttachmentThumbnails } from "../../card/components/AttachmentThumbnails";
import { AttachmentUpload } from "../../card/components/AttachmentUpload";
import Checklists from "../../card/components/Checklists";
import { DeleteChecklistConfirmation } from "../../card/components/DeleteChecklistConfirmation";
import { DeleteCommentConfirmation } from "../../card/components/DeleteCommentConfirmation";
import { DueDateSelector } from "../../card/components/DueDateSelector";
import { NewChecklistForm } from "../../card/components/NewChecklistForm";
import NewCommentForm from "../../card/components/NewCommentForm";

interface EventDetailModalProps {
  isVisible: boolean;
  entry: EditableEntry | null;
  onClose: () => void;
  onEdit: (entry: EditableEntry) => void;
  onDelete: (entry: EditableEntry) => void;
  isDeleting?: boolean;
}

type TaskStatus = "pending" | "done" | "missed" | "draft" | "waiting_approval" | "approved" | "rejected" | "waiting_evaluation" | "completed";

const STATUS_CONFIG: Record<
  TaskStatus,
  {
    label: string;
    icon: React.ReactNode;
    bg: string;
    activeBg: string;
    border: string;
    activeBorder: string;
    text: string;
    activeText: string;
    dot: string;
    glow: string;
    description: string;
  }
> = {
  pending: {
    label: "Pending",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    activeBg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-neutral-200 dark:border-neutral-700",
    activeBorder: "border-blue-400 dark:border-blue-500",
    text: "text-neutral-500 dark:text-neutral-400",
    activeText:
      "text-blue-700 dark:text-blue-300 ring-1 ring-blue-400 dark:ring-blue-500",
    dot: "bg-blue-500",
    glow: "shadow-blue-500/20",
    description: "In progress",
  },
  done: {
    label: "Done",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    activeBg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-neutral-200 dark:border-neutral-700",
    activeBorder: "border-emerald-400 dark:border-emerald-500",
    text: "text-neutral-500 dark:text-neutral-400",
    activeText:
      "text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-400 dark:ring-emerald-500",
    dot: "bg-emerald-500",
    glow: "shadow-emerald-500/20",
    description: "Completed",
  },
  missed: {
    label: "Missed",
    icon: (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    activeBg: "bg-rose-50 dark:bg-rose-900/30",
    border: "border-neutral-200 dark:border-neutral-700",
    activeBorder: "border-rose-400 dark:border-rose-500",
    text: "text-neutral-500 dark:text-neutral-400",
    activeText:
      "text-rose-700 dark:text-rose-300 ring-1 ring-rose-400 dark:ring-rose-500",
    dot: "bg-rose-500",
    glow: "shadow-rose-500/20",
    description: "Not completed",
  },
};

export function EventDetailModal({
  isVisible,
  entry,
  onClose,
  onEdit,
  onDelete,
  isDeleting,
}: EventDetailModalProps) {
  const { data: session } = authClient.useSession();
  const { data: users = [] } = api.user.getAll.useQuery();
  const utils = api.useUtils();

  const workspaceMembers = useMemo<WorkspaceMember[]>(() => {
    return users.map((u) => ({
      publicId: u.id,
      email: u.email ?? "",
      user: {
        id: u.id,
        name: u.name,
        image: null,
      },
    }));
  }, [users]);
  const { showPopup } = usePopup();
  const {
    modalContentType,
    isOpen: isSubModalOpen,
    entityId,
    openModal,
  } = useModal();
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeChecklistForm, setActiveChecklistForm] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<"comments" | "history">(
    "comments",
  );

  const { data: attachments } = api.attachment.getByTaskInstanceId.useQuery(
    { taskInstanceId: entry?.instanceId! },
    { enabled: !!entry?.instanceId && entry?.type === "INSTANCE" && isVisible },
  );

  const { data: activitiesData } = api.taskInstance.getActivities.useQuery(
    { id: entry?.instanceId!, limit: 100 },
    {
      enabled:
        !!entry?.instanceId &&
        entry?.type === "INSTANCE" &&
        isVisible &&
        activeTab === "comments",
    },
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

  const { data: latestInstance } = api.taskInstance.byId.useQuery(
    { id: entry?.instanceId! },
    { enabled: !!entry?.instanceId && entry?.type === "INSTANCE" && isVisible },
  );

  const [description, setDescription] = useState(entry?.description ?? "");

  useEffect(() => {
    setDescription(entry?.description ?? "");
  }, [entry?.description, isVisible]);

  const { data: currentUser } = api.user.getUser.useQuery();

  const canEdit =
    entry?.createdBy === session?.user?.id ||
    entry?.selectedUserId === session?.user?.id ||
    currentUser?.role === "ADMIN";

  const canComment =
    entry?.createdBy === session?.user?.id ||
    entry?.selectedUserId === session?.user?.id ||
    currentUser?.role === "ADMIN";

  const updateInstance = api.taskInstance.update.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
    },
    onError: (error: any) => {
      console.error("Mutation failed:", error);
    },
  });

  const handleDescriptionBlur = () => {
    if (description === entry?.description) return;
    if (!canEdit || !entry?.instanceId || !entry?.masterId) return;

    updateInstance.mutate({
      id: entry?.instanceId!,
      taskMasterId: entry?.masterId!,
      description: description,
      status: currentStatus,
    });
  };

  if (!entry) return null;

  const currentStatus: TaskStatus = entry.status! ?? "pending";
  const isBusy = updateInstance.isPending || isUpdating;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === currentStatus || isBusy) return;
    if (!entry.masterId) return;

    const userId = session?.user?.id;
    if (!userId) {
      showPopup({
        header: "Yêu cầu xác thực",
        message: "Bạn cần đăng nhập để cập nhật công việc.",
        icon: "info",
      });
      return;
    }

    setIsUpdating(true);
    try {
      await updateInstance.mutateAsync({
        id: entry.instanceId!,
        taskMasterId: entry.masterId,
        targetDate: new Date(entry.date),
        actualDate: new Date(entry.date),
        status: newStatus,
      });
    } catch (err: unknown) {
      const error = err as { message?: string; shape?: { message?: string } };
      const errStr = JSON.stringify(err).toLowerCase();
      const isDuplicate =
        error.message?.toLowerCase().includes("unique constraint") ||
        error.message?.toLowerCase().includes("duplicate") ||
        error.shape?.message?.toLowerCase().includes("unique constraint") ||
        errStr.includes("unique constraint");

      if (isDuplicate) {
        showPopup({
          header: "Conflict detected",
          message:
            "This task was already updated elsewhere. Refreshing the calendar.",
          icon: "info",
        });
        void utils.taskInstance.getVirtual.invalidate();
        onClose();
      } else {
        showPopup({
          header: "Error",
          message:
            error.message ?? "Unable to update task status. Please try again.",
          icon: "error",
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const statusConfig = STATUS_CONFIG[currentStatus];
  const displayChecklists = latestInstance?.checklists ?? entry.checklists;

  const startDate = entry.date ? new Date(entry.date) : new Date();
  if (entry.startTime) {
    const [h, m] = entry.startTime.split(":");
    if (h && m) startDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  }

  const endDate = entry.date ? new Date(entry.date) : new Date();
  if (entry.endTime) {
    const [h, m] = entry.endTime.split(":");
    if (h && m) endDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  }

  return (
    <Modal
      isVisible={isVisible}
      centered
      modalSize="lg"
      hideDefaultStyles
      onClose={onClose}
    >
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex h-[92vh] rounded-2xl border border-light-200 bg-white shadow-2xl dark:border-dark-300 dark:bg-dark-100"
        >
        <div className="flex w-1/2 flex-col border-r border-light-100 text-left dark:border-dark-300">
          <div className="shrink-0 border-b border-light-100 px-10 py-7 dark:border-dark-300">
            <h3 className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-2xl font-bold leading-snug text-neutral-900 dark:text-dark-1000">
              {entry.title}
            </h3>
          </div>
            <div className="shrink-0 border-b border-light-100 px-10 py-6 dark:border-dark-300">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                Mô tả
              </p>
              <div className="group relative flex min-h-[120px] w-full flex-col rounded-xl border border-light-200 bg-white shadow-sm transition-all focus-within:border-light-400 focus-within:shadow-md dark:border-dark-300 dark:bg-dark-100 dark:focus-within:border-dark-500">
                <Editor
                  content={description}
                  onChange={canEdit ? setDescription : undefined}
                  onBlur={canEdit ? handleDescriptionBlur : undefined}
                  readOnly={!canEdit}
                  workspaceMembers={workspaceMembers}
                  maxHeightClass="max-h-[300px]"
                />
              </div>
            </div>

          {/* Checklists */}
          <div className="flex-1 space-y-4 overflow-y-auto px-10 py-4">
            <div className="mb-3 flex items-center gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                Checklist
              </p>
              {canEdit && entry?.instanceId && (
                <button
                  onClick={() =>
                    openModal("ADD_CHECKLIST", entry.instanceId ?? undefined)
                  }
                  className="flex items-center justify-center rounded-lg bg-light-100 p-1 text-neutral-600 transition-all hover:bg-light-200 hover:text-neutral-900 dark:bg-dark-300 dark:text-dark-600 dark:hover:bg-dark-200 dark:hover:text-dark-500"
                  title="Thêm Checklist"
                >
                  <HiMiniPlus className="h-4 w-4" />
                </button>
              )}
            </div>
            {displayChecklists && (
              <Checklists
                checklists={displayChecklists}
                taskInstanceId={entry.instanceId!}
                activeChecklistForm={activeChecklistForm}
                setActiveChecklistForm={setActiveChecklistForm}
                viewOnly={!canEdit}
              />
            )}
          </div>
        </div>

        <div className="flex w-1/2 shrink-0 flex-col bg-light-50/50 text-left dark:bg-dark-50/30">
          <div className="relative z-50 flex shrink-0 items-center justify-end bg-white/50 py-2 pl-8 pr-4 backdrop-blur-sm dark:bg-dark-100/50">
            <div className="flex items-center gap-3">
              <button
                title="Delete"
                onClick={() => onDelete(entry)}
                disabled={!canEdit}
                className="flex h-7 w-7 items-center justify-center rounded-xl text-red-500 transition-all hover:bg-red-50 active:scale-95 dark:hover:bg-red-500/10"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
              <button
                title="Edit"
                onClick={() => onEdit(entry)}
                disabled={!canEdit}
                className="flex h-7 w-7 items-center justify-center rounded-xl text-light-950 transition-all hover:bg-light-100 hover:text-light-1000 active:scale-95 dark:text-dark-600 dark:hover:bg-dark-200 dark:hover:text-dark-1000"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </button>
              <div className="h-3 w-px bg-light-200 dark:bg-dark-300" />
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-xl text-light-950 transition-all hover:bg-light-100 hover:text-light-1000 active:scale-95 dark:text-dark-600 dark:hover:bg-dark-200 dark:hover:text-dark-1000"
              >
                <HiXMark className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-light-400 dark:scrollbar-thumb-dark-300">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-8 pb-2 pt-1 text-left">
              <div className="col-span-1 min-w-0 space-y-1.5">
                <div>
                  {entry.assigneeName ? (
                    <div className="flex w-fit items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                      {entry.assigneeName}
                    </div>
                  ) : (
                    <div className="flex min-h-[34px] w-full items-center rounded-xl bg-white px-3 text-left text-[13px] font-medium text-neutral-900 opacity-60 shadow-sm ring-1 ring-light-300 transition-all dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50">
                      Trống
                    </div>
                  )}
                </div>
              </div>

              <div className="col-span-1 min-w-0 space-y-1.5">
                <div>
                  <button
                    disabled={isBusy || !canEdit}
                    onClick={() =>
                      handleStatusChange(
                        entry.status === "pending" ? "done" : "pending",
                      )
                    }
                    className={`flex min-h-[34px] w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-medium shadow-sm transition-all ${!canEdit ? "cursor-not-allowed opacity-50" : statusConfig.activeBg + " " + statusConfig.activeText + " " + statusConfig.activeBorder + " hover:opacity-80"} `}
                  >
                    {statusConfig.icon}
                    {statusConfig.label === "Done"
                      ? "Đánh dấu chưa xong"
                      : "Đánh dấu đã xong"}
                  </button>
                </div>
              </div>

              <div className="col-span-1 min-w-0 space-y-1.5">
                <DueDateSelector
                  cardPublicId={entry.instanceId || ""}
                  dueDate={startDate}
                  disabled={true}
                  label="Bắt đầu"
                />
              </div>

              <div className="col-span-1 min-w-0 space-y-1.5">
                <DueDateSelector
                  cardPublicId={entry.instanceId || ""}
                  dueDate={endDate}
                  disabled={true}
                  label="Kết thúc"
                />
              </div>
            </div>

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
                  Tính năng
                </button>
                <button
                  onClick={() => setActiveTab("history")}
                  className={`relative z-10 flex-1 rounded-xl py-2.5 text-[11px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === "history"
                      ? "text-neutral-900 dark:text-dark-1000"
                      : "text-light-500 hover:text-light-700 dark:text-dark-500"
                  }`}
                >
                  Hoạt động
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
                    taskInstanceId={entry.instanceId!}
                    isLoading={false}
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
                  <div className="shrink-0 space-y-3">
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                        Tài liệu đính kèm
                      </p>
                      {attachments && attachments.length > 0 && (
                        <span className="flex h-5 items-center justify-center rounded-full bg-light-100 px-2 text-[10px] font-bold text-neutral-900 dark:bg-dark-300 dark:text-dark-600">
                          {attachments.length}
                        </span>
                      )}
                    </div>
                    <div className="rounded-xl border border-light-200 bg-white/50 p-3 shadow-sm dark:border-dark-300 dark:bg-dark-100/50">
                      {attachments && attachments.length > 0 && (
                        <div className="mb-3 max-h-40 overflow-y-auto rounded-lg bg-light-50/50 p-2 dark:bg-dark-200/50">
                          <AttachmentThumbnails
                            attachments={attachments}
                            taskInstanceId={entry.instanceId!}
                          />
                        </div>
                      )}
                      <AttachmentUpload
                        taskInstanceId={entry.instanceId!}
                        hideChecklistButton={true}
                      />
                    </div>
                  </div>

                  <div className="h-px bg-light-200 dark:bg-dark-300" />
                  {canComment && (
                    <div className="shrink-0 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                        Viết bình luận
                      </p>
                      <div className="rounded-xl border border-light-200 bg-white shadow-sm ring-1 ring-light-100/50 dark:border-dark-300 dark:bg-dark-100 dark:ring-white/5">
                        <NewCommentForm
                          taskInstanceId={entry?.instanceId!}
                          workspaceMembers={workspaceMembers}
                        />
                      </div>
                    </div>
                  )}

                  {hasComments && (
                    <div className="mt-2 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
                          Lịch sử bình luận
                        </p>
                        <div className="h-px flex-1 bg-light-200/50 dark:bg-dark-300/50" />
                      </div>

                      <div className="flex-1">
                        <ActivityList
                          taskInstanceId={entry.instanceId!}
                          isLoading={false}
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

      {/* Sub-modals for deleting comments & checklists */}
      <Modal
        modalSize="sm"
        isVisible={isSubModalOpen && modalContentType === "DELETE_COMMENT"}
      >
        <DeleteCommentConfirmation
          taskInstanceId={entry.instanceId!}
          commentPublicId={entityId}
        />
      </Modal>

      <Modal
        modalSize="sm"
        centered
        isVisible={isSubModalOpen && modalContentType === "ADD_CHECKLIST"}
      >
        <NewChecklistForm
          taskInstanceId={entry.instanceId!}
          onSuccess={() => {
            void utils.taskInstance.getVirtual.invalidate();
          }}
        />
      </Modal>

      <Modal
        modalSize="sm"
        centered
        isVisible={isSubModalOpen && modalContentType === "DELETE_CHECKLIST"}
      >
        <DeleteChecklistConfirmation
          taskInstanceId={entry.instanceId!}
          checklistPublicId={entityId}
        />
      </Modal>
    </Modal>
  );
}
