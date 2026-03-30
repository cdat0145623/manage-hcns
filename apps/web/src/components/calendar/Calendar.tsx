import type { DropResult } from "react-beautiful-dnd";
import { t } from "@lingui/macro";
import { motion } from "framer-motion";
import { useState } from "react";
import { DragDropContext } from "react-beautiful-dnd";

import type { ViewMode } from "./CalendarHeader";
import type { CreateEventInput, EditableEntry } from "./CreateEventModal";
import type { CalendarEntry } from "~/hooks/useRecurrence";
import { useRecurrence } from "~/hooks/useRecurrence";
import { usePopup } from "~/providers/popup";
import { CalendarHeader } from "./CalendarHeader";
import { CreateEventModal } from "./CreateEventModal";
import { DayView } from "./DayView";
import { EventDetailModal } from "./EventDetailModal";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";

function toEditableEntry(entry: CalendarEntry): EditableEntry {
  const date = new Date(entry.date);
  const startTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const endTotalMins =
    date.getHours() * 60 + date.getMinutes() + (entry.duration ?? 60);
  const endTime = `${String(Math.floor(endTotalMins / 60) % 24).padStart(2, "0")}:${String(endTotalMins % 60).padStart(2, "0")}`;
  return {
    id: entry.id,
    title: entry.title,
    description: "",
    date,
    startTime,
    endTime,
    color: entry.color,
    recurrence: "NONE",
    attendees: [],
  };
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("MONTH");
  const { calendarEntries, createInstance, moveTask } =
    useRecurrence(currentDate);
  const { showPopup } = usePopup();

  // ── Date selection ───────────────────────────
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // ── Detail modal state ───────────────────────
  const [detailEntry, setDetailEntry] = useState<EditableEntry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // ── Create/Edit modal state ──────────────────
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  /**
   * Click vào ô trống (cell / time slot) → mở form Create
   */
  const handleCellClick = (date: Date) => {
    setSelectedDate(date);
    setEditEntry(null);
    setIsFormOpen(true);
  };

  /**
   * Click vào task đã có → mở Detail popup
   * Virtual task (recurrence preview) → thông báo và không cho edit
   */
  const handleTaskClick = (entry: CalendarEntry) => {
    if (entry.type === "VIRTUAL") {
      showPopup({
        header: t`Virtual Task`,
        message: t`This is a preview of a recurring event. Create an instance first to edit it.`,
        icon: "info",
      });
      return;
    }
    setDetailEntry(toEditableEntry(entry));
    setIsDetailOpen(true);
  };

  /**
   * Nút "Edit Event" trong Detail popup → đóng detail, mở form Edit
   */
  const handleEditFromDetail = (entry: EditableEntry) => {
    setIsDetailOpen(false);
    // Dùng small delay để animation close của detail chạy xong trước khi mở form
    setTimeout(() => {
      setSelectedDate(new Date(entry.date));
      setEditEntry(entry);
      setIsFormOpen(true);
    }, 220);
  };

  /**
   * Nút "Delete" trong Detail popup
   */
  const handleDeleteEvent = (id: string) => {
    // TODO: gọi mutation / API xóa event ở đây
    console.log("Deleting event:", id);
    showPopup({
      header: t`Event Deleted`,
      message: t`The event has been removed from your calendar.`,
      icon: "success",
    });
  };

  /** Đóng detail popup */
  const handleDetailClose = () => {
    setIsDetailOpen(false);
    setTimeout(() => setDetailEntry(null), 280);
  };

  /** Đóng form modal */
  const handleFormClose = () => {
    setIsFormOpen(false);
    setTimeout(() => setEditEntry(null), 280);
  };

  /** Tạo event mới */
  const handleCreateEvent = (eventData: CreateEventInput) => {
    console.log("Creating event:", eventData);
    // TODO: gọi createInstance hoặc API tạo event
    showPopup({
      header: t`Event Created`,
      message: t`"${eventData.title}" has been added to your calendar.`,
      icon: "success",
    });
  };

  /** Cập nhật event */
  const handleUpdateEvent = (id: string, eventData: CreateEventInput) => {
    console.log("Updating event:", id, eventData);
    // TODO: gọi API update event
    showPopup({
      header: t`Event Updated`,
      message: t`"${eventData.title}" has been updated.`,
      icon: "success",
    });
  };

  /** Drag & drop */
  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    if (destination.droppableId.startsWith("droppable-")) {
      const dateStr = destination.droppableId.replace("droppable-", "");
      const newDate = new Date(dateStr);

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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col bg-white dark:bg-dark-50">
      <CalendarHeader
        currentDate={currentDate}
        setCurrentDate={setCurrentDate}
        viewMode={viewMode}
        setViewMode={setViewMode}
      />

      <div className="relative flex-1 overflow-hidden">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="relative h-full w-full">
            {/* Month View */}
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
                  onCellClick={handleCellClick}
                />
              </motion.div>
            )}

            {/* Week View */}
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
                  onCellClick={handleCellClick}
                />
              </motion.div>
            )}

            {/* Day View */}
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
                  onCellClick={handleCellClick}
                />
              </motion.div>
            )}
          </div>
        </DragDropContext>
      </div>

      {/* ── Detail Popup (view only) ── */}
      <EventDetailModal
        isVisible={isDetailOpen}
        entry={detailEntry}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteEvent}
      />

      {/* ── Create / Edit Form Modal ── */}
      <CreateEventModal
        isVisible={isFormOpen}
        selectedDate={selectedDate}
        onClose={handleFormClose}
        onSave={handleCreateEvent}
        onUpdate={handleUpdateEvent}
        editEntry={editEntry}
      />
    </div>
  );
}
