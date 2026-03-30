import { format } from "date-fns";
import { motion } from "framer-motion";

import type { EditableEntry } from "./CreateEventModal";
import Modal from "../modal";

interface EventDetailModalProps {
  isVisible: boolean;
  entry: EditableEntry | null;
  onClose: () => void;
  onEdit: (entry: EditableEntry) => void;
  onDelete: (id: string) => void;
}

export function EventDetailModal({
  isVisible,
  entry,
  onClose,
  onEdit,
  onDelete,
}: EventDetailModalProps) {
  if (!entry) return null;

  return (
    <Modal isVisible={isVisible} centered modalSize="sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-100"
      >
        <div className="flex-shrink-0 border-b border-light-200 bg-gradient-to-r from-blue-50 to-sky-50 px-7 py-5 dark:border-dark-300 dark:from-dark-200 dark:to-dark-300">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
              Event Details
            </h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-white/80 hover:text-neutral-700 dark:hover:bg-dark-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-4 px-7 py-6">
          <div>
            <h3 className="text-xl font-bold text-neutral-900 dark:text-white">{entry.title}</h3>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              {format(new Date(entry.date), "MMMM d, yyyy")} · {entry.startTime} – {entry.endTime}
            </p>
          </div>

          {entry.description && (
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">{entry.description}</p>
            </div>
          )}
        </div>

        <div className="flex flex-shrink-0 gap-3 border-t border-light-200 bg-light-50 px-7 py-4 dark:border-dark-300 dark:bg-dark-200">
          <button
            onClick={() => onDelete(entry.id)}
            className="flex-1 rounded-xl bg-red-50 px-6 py-3 text-sm font-bold text-red-600 transition-all hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
          >
            Delete
          </button>
          <button
            onClick={() => onEdit(entry)}
            className="flex-1 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg active:scale-[0.98] dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Edit Event
          </button>
        </div>
      </motion.div>
    </Modal>
  );
}
