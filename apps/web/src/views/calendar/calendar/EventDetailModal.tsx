import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { authClient } from "@kan/auth/client";

import type { EditableEntry } from "./CreateEventModal";
import { api } from "~/utils/api";
import { useModal } from "~/providers/modal";
import Modal from "../../../components/modal";
import ActivityList from "../../card/components/ActivityList";
import { AttachmentThumbnails } from "../../card/components/AttachmentThumbnails";
import { AttachmentUpload } from "../../card/components/AttachmentUpload";
import NewCommentForm from "../../card/components/NewCommentForm";
import { DeleteCommentConfirmation } from "../../card/components/DeleteCommentConfirmation";
import { usePopup } from "~/providers/popup";

interface EventDetailModalProps {
  isVisible: boolean;
  entry: EditableEntry | null;
  onClose: () => void;
  onEdit: (entry: EditableEntry) => void;
  onDelete: (entry: EditableEntry) => void;
  isDeleting?: boolean;
}

type TaskStatus = "pending" | "done" | "missed";

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
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    activeBg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-neutral-200 dark:border-neutral-700",
    activeBorder: "border-blue-400 dark:border-blue-500",
    text: "text-neutral-500 dark:text-neutral-400",
    activeText: "text-blue-700 dark:text-blue-300",
    dot: "bg-blue-500",
    glow: "shadow-blue-500/20",
    description: "In progress",
  },
  done: {
    label: "Done",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    activeBg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-neutral-200 dark:border-neutral-700",
    activeBorder: "border-emerald-400 dark:border-emerald-500",
    text: "text-neutral-500 dark:text-neutral-400",
    activeText: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500",
    glow: "shadow-emerald-500/20",
    description: "Completed",
  },
  missed: {
    label: "Missed",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: "bg-neutral-50 dark:bg-neutral-800/30",
    activeBg: "bg-rose-50 dark:bg-rose-900/30",
    border: "border-neutral-200 dark:border-neutral-700",
    activeBorder: "border-rose-400 dark:border-rose-500",
    text: "text-neutral-500 dark:text-neutral-400",
    activeText: "text-rose-700 dark:text-rose-300",
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
  const utils = api.useUtils();
  const { showPopup } = usePopup();
  const { modalContentType, isOpen: isSubModalOpen, entityId } = useModal();
  const [isUpdating, setIsUpdating] = useState(false);

  const { data: attachments } = api.attachment.getByTaskInstanceId.useQuery(
    { taskInstanceId: entry?.instanceId as string },
    { enabled: !!entry?.instanceId && entry?.type === "INSTANCE" && isVisible }
  );

  const createInstance = api.taskInstance.create.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
      onClose();
    },
    onError: (error: any) => {
      console.error("Mutation failed:", error);
    },
  });

  const updateInstance = api.taskInstance.update.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
      onClose();
    },
    onError: (error: any) => {
      console.error("Mutation failed:", error);
    },
  });

  if (!entry) return null;

  const currentStatus: TaskStatus = (entry.status as TaskStatus) ?? "pending";
  const isVirtual = entry.type === "VIRTUAL";
  const isBusy = createInstance.isPending || updateInstance.isPending || isUpdating;

  const handleCreateInstance = async () => {
    if (!entry.masterId) return;
    try {
      const userId = session?.user?.id;
      if (!userId) {
        showPopup({
          header: "Yêu cầu đăng nhập",
          message: "Bạn cần đăng nhập để hoàn thành công việc.",
          icon: "info",
        });
        return;
      }
      await createInstance.mutateAsync({
        taskMasterId: entry.masterId,
        targetDate: new Date(entry.date),
        actualDate: new Date(entry.date),
        status: "pending",
      });
    } catch (error: any) {
      console.error("Caught error in handleCreateInstance:", error);
      const isDuplicate = 
        error.message?.toLowerCase().includes("unique constraint") || 
        error.message?.toLowerCase().includes("duplicate") ||
        error.shape?.message?.toLowerCase().includes("unique constraint") ||
        JSON.stringify(error).toLowerCase().includes("unique constraint");

      if (isDuplicate) {
        showPopup({
          header: "Lỗi xung đột",
          message: "Công việc này đã được hoàn thành trước đó. Lịch sẽ tự động làm mới.",
          icon: "info",
        });
        void utils.taskInstance.getVirtual.invalidate();
        onClose();
      } else {
        showPopup({
          header: "Lỗi",
          message: error.message || "Không thể hoàn thành công việc. Vui lòng thử lại sau.",
          icon: "error",
        });
      }
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    if (newStatus === currentStatus || isBusy) return;
    if (!entry.masterId) return;

    const userId = session?.user?.id;
    if (!userId) {
      showPopup({
        header: "Authentication required",
        message: "You must be logged in to update tasks.",
        icon: "info",
      });
      return;
    }

    setIsUpdating(true);
    try {
      if (isVirtual) {
        await createInstance.mutateAsync({
          taskMasterId: entry.masterId,
          targetDate: new Date(entry.date),
          actualDate: new Date(entry.date),
          status: newStatus,
        });
      } else {
        await updateInstance.mutateAsync({
          id: entry.instanceId as string,
          taskMasterId: entry.masterId,
          targetDate: new Date(entry.date),
          actualDate: new Date(entry.date),
          status: newStatus,
        });
      }
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
          message: "This task was already updated elsewhere. Refreshing the calendar.",
          icon: "info",
        });
        void utils.taskInstance.getVirtual.invalidate();
        onClose();
      } else {
        showPopup({
          header: "Error",
          message: error.message ?? "Unable to update task status. Please try again.",
          icon: "error",
        });
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const statusConfig = STATUS_CONFIG[currentStatus];

  return (
    <Modal isVisible={isVisible} centered modalSize="sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative flex flex-col overflow-hidden rounded-3xl border border-neutral-200/50 bg-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/90"
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-light-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 dark:border-dark-300 dark:from-dark-200 dark:to-dark-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm ${statusConfig.activeBg} ${statusConfig.activeText}`}>
                {statusConfig.icon}
              </div>
              <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                Task Details
              </h2>
            </div>
            <div className="flex gap-1">
              <motion.button
                title="Delete"
                whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.8)" }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onDelete(entry)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-neutral-400 shadow-sm transition-all hover:text-neutral-900 dark:hover:bg-dark-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </motion.button>
              <motion.button
                title="Edit"
                whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.8)" }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onEdit(entry)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-neutral-400 shadow-sm transition-all hover:text-neutral-900 dark:hover:bg-dark-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </motion.button>
              <motion.button
                title="Close"
                whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.8)" }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-neutral-400 shadow-sm transition-all hover:text-neutral-900 dark:hover:bg-dark-300"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            </div>
          </div>
        </div>

        {/* Body */}
        {!isVirtual ? (
          <div className="space-y-5 px-7 py-6">
            {/* Title & Meta */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white truncate">
                  {entry.title}
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {format(new Date(entry.date), "MMMM d, yyyy")} · {entry.startTime} – {entry.endTime}
              </p>
            </div>
            {entry.assigneeName && (
              <div className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-900 shadow-sm dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {entry.assigneeName}
              </div>
            )}
          </div>

          {entry.description && (
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {entry.description}
            </p>
          )}

          <div className="flex flex-col space-y-2.5">
            {entry.type === "INSTANCE" && (
              <div className="mt-2">
                <AttachmentUpload taskInstanceId={entry.instanceId as string} />
              </div>
            )}
            <div className="flex items-center justify-end">
              {entry.status === "pending" ? (
                <motion.button
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleStatusChange("done")}
                  className="group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border-2 border-neutral-300 bg-white px-3 py-3.5 text-center text-neutral-900 shadow-sm transition-all duration-200 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  <span className="text-[12px] font-black tracking-widest">Mark completed</span>
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleStatusChange("pending")}
                  className="group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border-2 border-neutral-300 bg-white px-3 py-3.5 text-center text-neutral-900 shadow-sm transition-all duration-200 hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-neutral-600 dark:hover:bg-neutral-800"
                >
                  <span className="text-[12px] font-black tracking-widest">Mark in-progress</span>
                </motion.button>
              )}
            </div>
          </div>

          {entry.type === "INSTANCE" && attachments && attachments.length > 0 && (
            <div className="mt-4">
              <AttachmentThumbnails
                attachments={attachments}
                taskInstanceId={entry.instanceId as string}
              />
            </div>
          )}
        </div>) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="flex flex-col"
        >
          <div className="space-y-4 px-7 py-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
                {entry.title}
              </h3>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {format(new Date(entry.date), "MMMM d, yyyy")} ·{" "}
                {entry.startTime} – {entry.endTime}
              </p>
            </div>
            {entry.status && (
              <div className="flex items-center gap-2 flex-col">
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm ${
                    entry.status === "done"
                      ? "bg-green-200 border-green-300 text-green-900 dark:bg-green-900/40 dark:border-green-800 dark:text-white"
                      : entry.status === "missed"
                        ? "bg-red-200 border-red-300 text-red-900 dark:bg-red-900/40 dark:border-red-800 dark:text-white"
                        : "bg-blue-200 border-blue-300 text-blue-900 dark:bg-blue-900/40 dark:border-blue-800 dark:text-white"
                  }`}
                >
                  <div
                    className={`h-1.5 w-1.5 rounded-full ${
                      entry.status === "done"
                        ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"
                        : entry.status === "missed"
                          ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                          : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                    }`}
                  />
                  {entry.status}
                </div>
                <div className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest shadow-sm bg-yellow-200 border-yellow-300 text-yellow-900 dark:bg-yellow-900/40 dark:border-yellow-800 dark:text-white">
                  {entry.assigneeName}
                </div>
              </div>
            )}
          </div>

          {entry.description && (
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {entry.description}
              </p>
            </div>
          )}

          {isVirtual && (
            <div className="rounded-xl bg-amber-50 p-3 text-[12px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              ⚠️ This is a virtual task automatically created from the recurring schedule. Click <strong>Create</strong> to create the task.
            </div>
          )}
        </div>
        </motion.div>
        )}

        {/* Footer - Activity & Comments */}
        {entry.type === "INSTANCE" ? (
            <div className="border-t border-light-200 bg-light-50 p-6 dark:border-dark-300 dark:bg-dark-200 max-h-[500px] overflow-y-auto">
                <div className="mb-6">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Activity</h3>
                    <ActivityList 
                        taskInstanceId={entry.instanceId as string} 
                        isLoading={false}
                        includedTypes={[
                            "updated_attachment_added", 
                            "updated_attachment_renamed", 
                            "updated_attachment_removed", 
                            "comment", 
                            "updated_comment_added", 
                            "updated_comment_updated", 
                            "updated_comment_deleted"
                        ]}
                    />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white mb-4">Add Comment</h3>
                    <NewCommentForm 
                        taskInstanceId={entry.instanceId as string}
                        workspaceMembers={[]} // Optional for now
                    />
                </div>
            </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCreateInstance}
              disabled={createInstance.isPending || updateInstance.isPending}
              className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-[0.98] disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {createInstance.isPending || updateInstance.isPending
                ? "Đang xử lý..."
                : "Tạo"}
            </button>
          </div>
        )}

        {/* Sub-modal for deleting comments */}
        <Modal
            modalSize="sm"
            isVisible={isSubModalOpen && modalContentType === "DELETE_COMMENT"}
        >
            <DeleteCommentConfirmation
                taskInstanceId={entry.instanceId as string}
                commentPublicId={entityId}
            />
        </Modal>
      </motion.div>
    </Modal>
  );
}
