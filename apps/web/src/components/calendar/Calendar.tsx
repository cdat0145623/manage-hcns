import { useState } from "react";
import { CalendarHeader } from "./CalendarHeader";
import type { ViewMode } from "./CalendarHeader";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { useRecurrence } from "~/hooks/useRecurrence";
import type { CalendarEntry } from "~/hooks/useRecurrence";
import { motion } from "framer-motion";
import Modal from "../modal";
import { format, parseISO } from "date-fns";
import { DragDropContext } from "react-beautiful-dnd";
import type { DropResult } from "react-beautiful-dnd";
import { usePopup } from "~/providers/popup";
import { t } from "@lingui/macro";

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("MONTH");
  const { calendarEntries, createInstance, moveTask } = useRecurrence(currentDate);
  const { showPopup } = usePopup();

  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTaskClick = (entry: CalendarEntry) => {
    setSelectedEntry(entry);
    setIsModalOpen(true);
  };

  const handleCreateInstance = () => {
    if (selectedEntry && selectedEntry.type === "VIRTUAL") {
      createInstance(selectedEntry.masterId, selectedEntry.date);
      setIsModalOpen(false);
      setSelectedEntry(null);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId } = result;

    if (!destination) return;
    
    // Check if the drop target is a day cell
    if (destination.droppableId.startsWith("droppable-")) {
      const dateStr = destination.droppableId.replace("droppable-", "");
      const newDate = parseISO(dateStr);

      // Virtual tasks cannot be moved in this simple implementation
      if (draggableId.startsWith("v_")) {
        showPopup({
          header: t`Cannot move virtual task`,
          message: t`Please create the task instance first before moving it.`,
          icon: "info",
        });
        return;
      }

      moveTask(draggableId, newDate);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white dark:bg-dark-50">
      <CalendarHeader
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <div className="flex-1 overflow-hidden relative">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="h-full w-full relative">
            {viewMode === "MONTH" && (
              <motion.div
                key="month"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <MonthView
                  currentDate={currentDate}
                  entries={calendarEntries}
                  onTaskClick={handleTaskClick}
                />
              </motion.div>
            )}
            {viewMode === "WEEK" && (
              <motion.div
                key="week"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <WeekView
                  currentDate={currentDate}
                  entries={calendarEntries}
                  onTaskClick={handleTaskClick}
                />
              </motion.div>
            )}
            {viewMode === "DAY" && (
              <motion.div
                key="day"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0"
              >
                <DayView
                  currentDate={currentDate}
                  entries={calendarEntries}
                  onTaskClick={handleTaskClick}
                />
              </motion.div>
            )}
          </div>
        </DragDropContext>
      </div>

      {/* Quick Create / Detail Modal */}
      <Modal isVisible={isModalOpen} centered modalSize="md">
        <div className="relative overflow-hidden rounded-xl bg-white shadow-2xl transition-all dark:bg-dark-100">
          {selectedEntry && (
            <>
              {/* Header with Background Accent */}
              <div 
                className="h-24 w-full opacity-20 dark:opacity-40"
                style={{ backgroundColor: selectedEntry.color }}
              />
              
              <div className="px-8 pb-8 pt-0">
                <div className="-mt-12 flex items-center justify-between">
                  <div 
                    className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-white text-3xl shadow-lg dark:border-dark-100 dark:bg-dark-200"
                    style={{ color: selectedEntry.color }}
                  >
                    {selectedEntry.type === "VIRTUAL" ? "✨" : "📌"}
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-light-100 text-light-500 hover:bg-light-200 hover:text-light-900 dark:bg-dark-300 dark:text-dark-500 dark:hover:bg-dark-400 dark:hover:text-dark-100"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-6">
                  <span
                    className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-md"
                    style={{ backgroundColor: selectedEntry.color }}
                  >
                    {selectedEntry.type} OCCURRENCE
                  </span>
                  <h2 className="mt-4 text-3xl font-black leading-tight tracking-tight text-neutral-900 dark:text-white">
                    {selectedEntry.title}
                  </h2>
                  
                  <div className="mt-6 flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 rounded-lg bg-light-100 px-3 py-2 text-sm font-medium text-light-600 dark:bg-dark-200 dark:text-dark-600">
                      <span className="text-lg">📅</span>
                      {format(selectedEntry.date, "EEEE, MMMM do")}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-light-100 px-3 py-2 text-sm font-medium text-light-600 dark:bg-dark-200 dark:text-dark-600">
                      <span className="text-lg">⏰</span>
                      {format(selectedEntry.date, "HH:mm")} ({selectedEntry.duration} mins)
                    </div>
                  </div>

                  <div className="mt-8 rounded-2xl border border-light-200 bg-light-50 p-6 dark:border-dark-300 dark:bg-dark-50/50">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-light-400 dark:text-dark-500">
                      Description & Guidance
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                      {selectedEntry.type === "VIRTUAL"
                        ? "This event is currently a projection from your Master Schedule. \"Realizing\" this instance will create a persistent task where you can track progress, add comments, and manage checklists."
                        : "This is a realized instance. You can manage this task directly in the board or use the quick actions below."}
                    </p>
                  </div>

                  <div className="mt-8 flex gap-3">
                    {selectedEntry.type === "VIRTUAL" ? (
                      <button
                        onClick={handleCreateInstance}
                        className="flex-1 items-center justify-center rounded-xl bg-primary-500 py-4 font-black tracking-tight text-white shadow-[0_10px_20px_-5px_rgba(59,130,246,0.3)] transition-all hover:bg-primary-600 hover:shadow-[0_15px_25px_-5px_rgba(59,130,246,0.4)] active:scale-[0.98]"
                      >
                        ⚡ Realize Task Instance
                      </button>
                    ) : (
                      <button
                        onClick={() => setIsModalOpen(false)}
                        className="flex-1 items-center justify-center rounded-xl bg-primary-500 py-4 font-black tracking-tight text-white shadow-[0_10px_20px_-5px_rgba(59,130,246,0.3)] transition-all hover:bg-primary-600"
                      >
                        Open Task Board
                      </button>
                    )}
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="rounded-xl bg-light-100 px-6 py-4 font-bold text-light-600 transition-all hover:bg-light-200 dark:bg-dark-200 dark:text-dark-600 dark:hover:bg-dark-300"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
