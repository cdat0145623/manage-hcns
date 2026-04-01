/* eslint-disable @typescript-eslint/no-unused-vars */

import { format } from "date-fns";
import { motion } from "framer-motion";
import { authClient } from "@kan/auth/client";

import type { EditableEntry } from "./CreateEventModal";
import { api } from "~/utils/api";
import { usePopup } from "~/providers/popup";
import Modal from "../modal";

interface EventDetailModalProps {
  isVisible: boolean;
  entry: EditableEntry | null;
  onClose: () => void;
  onEdit: (entry: EditableEntry) => void;
  onDelete: (entry: EditableEntry) => void;
  isDeleting?: boolean;
}

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

  const createInstance = api.taskInstance.create.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
      onClose();
    },
    onError: (error: any) => {
      // Catch errors in the mutation callback as a second line of defense
      console.error("Mutation failed:", error);
    },
  });

  const updateInstance = api.taskInstance.update.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
      onClose();
    },
    onError: (error: any) => {
      // Catch errors in the mutation callback
      console.error("Mutation failed:", error);
    },
  });

  if (!entry) return null;

  const isPending = entry.status === "pending";
  const isVirtual = entry.type === "VIRTUAL";
  const isDone = entry.status === "done";

  const handleComplete = async () => {
    if (!entry.masterId) return;
    try {
      if (isVirtual) {
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
          userId,
          taskMasterId: entry.masterId,
          targetDate: new Date(entry.date),
          actualDate: new Date(),
          status: "done",
        });
      } else if (entry.instanceId) {
        await updateInstance.mutateAsync({
          id: entry.instanceId,
          taskMasterId: entry.masterId,
          targetDate: new Date(entry.date),
          actualDate: new Date(),
          status: "done",
        });
      }
    } catch (error: any) {
      console.error("Caught error in handleComplete:", error);
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

  return (
    <Modal isVisible={isVisible} centered modalSize="sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative flex flex-col overflow-hidden rounded-3xl border border-neutral-200/50 bg-white/90 shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/90"
      >
        <div className="flex-shrink-0 border-b border-light-200 bg-gradient-to-r from-blue-50 to-sky-50 px-7 py-5 dark:border-dark-300 dark:from-dark-200 dark:to-dark-300">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
              Chi tiết công việc
            </h2>
            <motion.button
              whileHover={{ scale: 1.1, backgroundColor: "rgba(255,255,255,0.8)" }}
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-neutral-400 shadow-sm transition-all hover:text-neutral-900 dark:hover:bg-dark-300"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </motion.button>
          </div>
        </div>

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
            <div className="rounded-xl bg-amber-50 p-3 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
              ⚠️ Đây là công việc ảo được tạo tự động từ lịch lặp. Nhấn Hoàn
              thành để lưu kết quả.
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-col gap-3 border-t border-light-200 bg-light-50 px-7 py-4 dark:border-dark-300 dark:bg-dark-200">
          <div className="flex gap-3">
            <button
              onClick={() => onDelete(entry)}
              disabled={isDeleting}
              className="flex-1 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
            >
              {isDeleting ? "Đang xóa..." : "Xóa"}
            </button>
            <button
              onClick={() => onEdit(entry)}
              className="flex-1 rounded-xl border border-light-300 bg-white px-4 py-2.5 text-sm font-bold text-neutral-700 shadow-sm transition-all hover:bg-light-100 dark:border-dark-400 dark:bg-dark-300 dark:text-neutral-300 dark:hover:bg-dark-400"
            >
              Chỉnh sửa
            </button>
          </div>

          {isPending && (
            <button
              onClick={handleComplete}
              disabled={createInstance.isPending || updateInstance.isPending}
              className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-emerald-700 hover:shadow-lg active:scale-[0.98] disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-600"
            >
              {createInstance.isPending || updateInstance.isPending
                ? "Đang xử lý..."
                : "Hoàn thành ✓"}
            </button>
          )}
        </div>
      </motion.div>
    </Modal>
  );
}
