import { format } from "date-fns";
import { motion } from "framer-motion";
import { MdClose } from "react-icons/md";
import { useEffect } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { CalendarTask } from "./CalendarTask";

interface DayTasksPopoverProps {
  day: Date;
  entries: CalendarEntry[];
  onClose: () => void;
  onTaskClick: (entry: CalendarEntry) => void;
}

export function DayTasksPopover({
  day,
  entries,
  onClose,
  onTaskClick,
}: DayTasksPopoverProps) {
  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-all dark:bg-black/40"
      />

      {/* Popover Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 10, rotateX: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0, rotateX: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 10, rotateX: 10 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className="relative w-full max-w-[340px] overflow-hidden rounded-3xl border border-white/40 bg-white/95 shadow-2xl shadow-blue-500/10 backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/95"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 p-5 dark:border-white/5">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
              {format(day, "EEEE")}
            </span>
            <span className="text-xl font-black text-neutral-900 dark:text-white">
              {format(day, "MMMM d")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-50 text-neutral-400 transition-all hover:bg-neutral-100 hover:text-neutral-900 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:hover:text-white"
          >
            <MdClose size={24} />
          </button>
        </div>

        {/* Task List */}
        <div className="max-h-[380px] overflow-y-auto p-4 custom-scrollbar">
          <div className="flex flex-col gap-3">
            {entries.length > 0 ? (
              entries.map((entry, idx) => (
                <div key={entry.id} className="min-h-[20px]">
                   <CalendarTask
                    entry={entry}
                    onClick={(clickedEntry) => {
                      onTaskClick(clickedEntry);
                      onClose();
                    }}
                    index={idx}
                    isDraggable={false}
                  />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="text-sm font-bold text-neutral-300 dark:text-neutral-600">
                  No tasks for this day
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Hint */}
        <div className="bg-neutral-50/50 p-4 text-center dark:bg-neutral-800/20">
          <span className="text-[10px] font-bold text-neutral-400">
            Click a task to view details or edit
          </span>
        </div>
      </motion.div>
    </div>
  );
}
