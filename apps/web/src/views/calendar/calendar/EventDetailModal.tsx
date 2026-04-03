import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { authClient } from "@kan/auth/client";

import type { EditableEntry } from "./CreateEventModal";
import { api } from "~/utils/api";
import { usePopup } from "~/providers/popup";
import Modal from "../../../components/modal";

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
  const [isUpdating, setIsUpdating] = useState(false);

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
      // More aggressive check for ANY database constraint or duplicate error
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
        // Create the instance with the chosen status
        await createInstance.mutateAsync({
          taskMasterId: entry.masterId,
          targetDate: new Date(entry.date),
          actualDate: new Date(entry.date),
          status: newStatus,
        });
      } else {
        // Update existing instance - instanceId is guaranteed when not virtual
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
        <div className="flex-shrink-0 border-b border-light-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-7 py-5 dark:border-dark-300 dark:from-dark-200 dark:to-dark-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm ${statusConfig.activeBg} ${statusConfig.activeText}`}>
                {statusConfig.icon}
              </div>
              <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                Task Details
              </h2>
            </div>
            <motion.button
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

          {isVirtual && (
            <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3.5 dark:bg-amber-900/20">
              <span className="mt-0.5 flex-shrink-0 text-base">⚡</span>
              <p className="text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
                This is a virtual instance generated from a recurring schedule. Selecting any status will save it as a real record.
              </p>
            </div>
          )}

          {/* Status Selector */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-400">
              Status
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map((status) => {
                const config = STATUS_CONFIG[status];
                const isActive = currentStatus === status;
                return (
                  <motion.button
                    key={status}
                    whileHover={{ scale: isBusy ? 1 : 1.03, y: isBusy ? 0 : -1 }}
                    whileTap={{ scale: isBusy ? 1 : 0.97 }}
                    onClick={() => handleStatusChange(status)}
                    disabled={isBusy}
                    className={`group relative flex flex-col items-center gap-1.5 overflow-hidden rounded-2xl border-2 px-3 py-3.5 text-center transition-all duration-200 ${
                      isActive
                        ? `${config.activeBg} ${config.activeBorder} shadow-lg ${config.glow}`
                        : `${config.bg} ${config.border} hover:${config.activeBg} hover:${config.activeBorder}`
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {/* Active indicator dot */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          className={`absolute right-2 top-2 h-2 w-2 rounded-full ${config.dot} shadow-sm`}
                        />
                      )}
                    </AnimatePresence>

                    {/* Icon */}
                    <div className={`transition-colors duration-200 ${isActive ? config.activeText : config.text} group-hover:${config.activeText}`}>
                      {config.icon}
                    </div>

                    {/* Label */}
                    <span className={`text-[11px] font-black leading-none transition-colors duration-200 ${isActive ? config.activeText : config.text} group-hover:${config.activeText}`}>
                      {config.label}
                    </span>

                    {/* Loading spinner overlay */}
                    <AnimatePresence>
                      {isBusy && isActive && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/60 dark:bg-neutral-900/60"
                        >
                          <svg className={`h-4 w-4 animate-spin ${config.activeText}`} viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </div>
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
              ⚠️ Đây là công việc ảo được tạo tự động từ lịch lặp. Nhấn <strong>Tạo</strong> để tạo công việc.
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col gap-3 border-t border-light-200 bg-light-50 px-7 py-4 dark:border-dark-300 dark:bg-dark-200">
            <div className="flex gap-3">
                {/* <button
                  onClick={handleCreateInstance}
                  disabled={createInstance.isPending || updateInstance.isPending}
                  className="w-full rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-[0.98] disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {createInstance.isPending || updateInstance.isPending
                    ? "Đang xử lý..."
                    : "Tạo"}
                </button> */}
            </div>
        </div>
        </motion.div>
        )}

        {/* Footer */}
        <div className="flex flex-shrink-0 gap-3 border-t border-light-200 bg-light-50 px-7 py-4 dark:border-dark-300 dark:bg-dark-200">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onDelete(entry)}
            disabled={isDeleting || isBusy}
            className="flex-1 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onEdit(entry)}
            disabled={isBusy}
            className="flex-1 rounded-xl border border-light-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm transition-all hover:bg-light-100 disabled:opacity-50 dark:border-dark-400 dark:bg-dark-300 dark:text-neutral-300 dark:hover:bg-dark-400"
          >
            Edit
          </motion.button>
          {isVirtual && (
            <div className="flex gap-3">
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
        </div>
      </motion.div>
    </Modal>
  );
}
