/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { DropResult } from "react-beautiful-dnd";
import { t } from "@lingui/macro";
import { isSameMonth, startOfMonth } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { DragDropContext } from "react-beautiful-dnd";

import type { ViewMode } from "./calendar/CalendarHeader";
import type {
  CreateEventInput,
  EditableEntry,
} from "./calendar/CreateEventModal";
import type { CalendarEntry } from "~/hooks/useRecurrence";
import Modal from "~/components/modal";
import { useRecurrence } from "~/hooks/useRecurrence";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import CardDetailsModalContent from "../card/components/CardDetailsModalContent";
import { CalendarHeader } from "./calendar/CalendarHeader";
import { CreateEventModal } from "./calendar/CreateEventModal";
import { DayView } from "./calendar/DayView";
import { EventDetailModal } from "./calendar/EventDetailModal";
import { MonthView } from "./calendar/MonthView";
import { SuccessModal } from "./calendar/SuccessModal";
import { WeekView } from "./calendar/WeekView";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { useModal } from "~/providers/modal";

function toEditableEntry(entry: CalendarEntry): EditableEntry {
  const startDate = new Date(entry.startDate);
  const endDate = new Date(entry.endDate);
  const startTime = `${String(startDate.getHours()).padStart(2, "0")}:${String(startDate.getMinutes()).padStart(2, "0")}`;
  const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
  return {
    id: entry.id,
    masterId: entry.masterId,
    instanceId: entry.instanceId,
    type: entry.type,
    status: entry.status,
    title: entry.title,
    description: entry.description,
    assigneeName: entry.assigneeName,
    selectedUserId: entry.selectedUserId,
    date: entry.date,
    startDate,
    endDate,
    startTime,
    endTime,
    color: entry.color,
    recurrence: entry.recurrence,
    rruleString: entry.rruleString,
    rruleStringToText: entry.rruleStringToText,
    attendees: [],
    checklists: entry.checklists,
    createdBy: entry.createdBy,
  };
}

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const prevDateRef = useRef(currentDate);
  const [direction, setDirection] = useState(0);
  const { modalContentType, openModal, isOpen } = useModal();

  useEffect(() => {
    if (currentDate.getTime() > prevDateRef.current.getTime()) {
      setDirection(1);
    } else if (currentDate.getTime() < prevDateRef.current.getTime()) {
      setDirection(-1);
    }
    prevDateRef.current = currentDate;
  }, [currentDate]);

  const { data: currentUser } = api.user.getUser.useQuery();
  const { data: allUsers } = api.user.getAll.useQuery();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(
    undefined,
  );

  const displayUsers = useMemo(() => {
    if (!currentUser) return [];

    if (currentUser.role === "ADMIN") {
      const baseUsers = allUsers || [];
      const isSelfInList = baseUsers.some((u) => u.id === currentUser.id);
      if (!isSelfInList) {
        return [
          {
            id: currentUser.id,
            name: currentUser.name,
            email: currentUser.email,
            username: currentUser.username,
          },
          ...baseUsers,
        ];
      }
      return baseUsers;
    }

    return [
      {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        username: currentUser.username,
      },
    ];
  }, [currentUser, allUsers]);

  useEffect(() => {
    if (displayUsers.length > 0 && !selectedUserId) {
      if (currentUser?.role !== "ADMIN") {
        setSelectedUserId(currentUser?.id);
      } else {
        setSelectedUserId(displayUsers[0]?.id);
      }
    }
  }, [displayUsers, currentUser, selectedUserId]);

  const [viewMode, setViewMode] = useState<ViewMode>("DAY");
  const { calendarEntries, cards, formattedResult, moveTask } = useRecurrence(
    currentDate,
    selectedUserId,
  );
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const [detailEntry, setDetailEntry] = useState<EditableEntry | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState({ title: "", message: "" });

  // Custom delete confirmation (replaces window.confirm)
  const [deleteConfirmEntry, setDeleteConfirmEntry] =
    useState<EditableEntry | null>(null);

  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);

  const handleCardClick = (card: any) => {
    setActiveCardId(card.publicId);
    setIsCardModalOpen(true);
  };

  const deleteMutation = api.taskInstance.delete.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
      setIsDetailOpen(false);
      showPopup({
        header: t`Đã xóa sự kiện`,
        message: t`Sự kiện đã được xóa khỏi lịch của bạn.`,
        icon: "success",
      });
    },
    onError: (error: any) => {
      console.error("Delete failed:", error);
      const isDuplicate =
        error.message?.toLowerCase().includes("unique constraint") ||
        error.message?.toLowerCase().includes("duplicate") ||
        JSON.stringify(error).toLowerCase().includes("unique constraint");

      if (isDuplicate) {
        showPopup({
          header: "Phát hiện xung đột",
          message:
            "Dữ liệu này đã bị thay đổi ở nơi khác. Lịch sẽ tự động làm mới.",
          icon: "info",
        });
      } else {
        showPopup({
          header: "Lỗi",
          message: error.message || "Không thể xóa sự kiện.",
          icon: "error",
        });
      }
      void utils.taskInstance.getVirtual.invalidate();
    },
  });

  const createInstance = api.taskInstance.create.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
    },
    onError: (error: any) => {
      console.error("Mutation failed:", error);
    },
  });

  const handleCellClick = (date: Date) => {
    const d = new Date(date);
    if (viewMode === "MONTH") {
      d.setMilliseconds(1);
    } else {
      d.setMilliseconds(0);
    }
    setSelectedDate(d);
    setEditEntry(null);
    setIsFormOpen(true);
  };

  const handleTaskClick = async (entry: CalendarEntry) => {
    if (entry.type === "VIRTUAL") {
      try {
        const userId = currentUser?.id;
        if (!userId) {
          showPopup({
            header: "Yêu cầu đăng nhập",
            message: "Bạn cần đăng nhập để hoàn thành công việc.",
            icon: "info",
          });
          return;
        }

        const newInstance = await createInstance.mutateAsync({
          taskMasterId: entry.masterId,
          targetDate: new Date(entry.date),
          actualDate: new Date(entry.date),
          status: "pending",
        });

        const editable = toEditableEntry(entry);
        editable.type = "INSTANCE";
        editable.instanceId = newInstance.id;
        editable.status = newInstance.status;

        setDetailEntry(editable);
        setIsDetailOpen(true);
      } catch (error: any) {
        console.error("Caught error in handleTaskClick createInstance:", error);
        const isDuplicate =
          error.message?.toLowerCase().includes("unique constraint") ||
          error.message?.toLowerCase().includes("duplicate") ||
          error.shape?.message?.toLowerCase().includes("unique constraint") ||
          JSON.stringify(error).toLowerCase().includes("unique constraint");

        if (isDuplicate) {
          showPopup({
            header: "Lỗi xung đột",
            message:
              "Công việc này đã được hoàn thành trước đó. Lịch sẽ tự động làm mới.",
            icon: "info",
          });
          void utils.taskInstance.getVirtual.invalidate();
        } else {
          showPopup({
            header: "Lỗi",
            message:
              error.message ||
              "Không thể tạo công việc. Vui lòng thử lại sau.",
            icon: "error",
          });
        }
      }
    } else {
      const editable = toEditableEntry(entry);
      setDetailEntry(editable);
      setIsDetailOpen(true);
    }
  };

  const handleViewDay = (date: Date) => {
    setDirection(0);
    setCurrentDate(date);
    setViewMode("DAY");
  };

  const handleEditFromDetail = (entry: EditableEntry) => {
    setIsDetailOpen(false);
    setTimeout(() => {
      setSelectedDate(new Date(entry.date));
      setEditEntry(entry);
      setIsFormOpen(true);
    }, 220);
  };

  const handleDeleteEvent = (
    entry: EditableEntry,
    deleteType?: "single" | "all",
  ) => {
    if (!entry.masterId) return;

    // If no type is provided, show custom confirmation modal
    if (!deleteType) {
      // BUG-2 FIX: Virtual tasks have no real instance — cannot delete "single"
      // if (entry.type === "VIRTUAL") {
      //   showPopup({
      //     header: "Không thể xóa công việc ảo",
      //     message:
      //       "Công việc này không có trường hợp thực. Hãy xóa toàn bộ chuỗi lặp lại.",
      //     icon: "info",
      //   });
      //   setDeleteConfirmEntry(null);
      //   return;
      // }
      setDeleteConfirmEntry(entry);
      return;
    }

    // Close the detail modal first
    setIsDetailOpen(false);
    setTimeout(() => setDetailEntry(null), 280);

    if (deleteType === "all") {
      deleteMutation.mutate({
        id: entry.id,
        taskMasterId: entry.masterId,
        type: "all",
      });
    }
    // else {
    // For single deletion, use instanceId (BUG-2: guard already blocks virtual tasks above)
    // const idToDelete = entry.instanceId ?? entry.id;

    // deleteMutation.mutate({
    //   id: idToDelete,
    //   taskMasterId: entry.masterId,
    //   type: "single",
    // });
    //}
  };

  const handleDetailClose = () => {
    setIsDetailOpen(false);
    setTimeout(() => setDetailEntry(null), 280);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setTimeout(() => setEditEntry(null), 280);
  };

  const handleCreateEvent = (eventData: CreateEventInput) => {
    setSuccessData({
      title: t`Created Successfully!`,
      message: t`"${eventData.title}" has been added to your calendar.`,
    });
  };

  const handleUpdateEvent = (id: string, eventData: CreateEventInput) => {
    setSuccessData({
      title: t`Updated Successfully!`,
      message: t`"${eventData.title}" has been updated.`,
    });
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, draggableId } = result;
    if (!destination) return;

    if (destination.droppableId.startsWith("droppable-")) {
      const dateStr = destination.droppableId.replace("droppable-", "");
      const newDate = new Date(dateStr);

      if (draggableId.startsWith("virtual_") || draggableId.startsWith("v_")) {
        showPopup({
          header: t`Không thể di chuyển công việc ảo`,
          message: t`Vui lòng tạo instance trước khi di chuyển.`,
          icon: "info",
        });
        return;
      }

      moveTask(draggableId, newDate);
    }
  };

  return (
    <div className="flex h-full flex-col bg-neutral-50/50 dark:bg-neutral-950">
      <div className="z-20 border-b border-neutral-200/50 bg-white/80 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-neutral-900/80">
        <CalendarHeader
          currentDate={currentDate}
          setCurrentDate={setCurrentDate}
          selectedUserId={selectedUserId}
          setSelectedUserId={setSelectedUserId}
          users={displayUsers}
          viewMode={viewMode}
          setViewMode={(mode) => {
            setDirection(0);

            if (!isSameMonth(currentDate, new Date())) {
              if (mode === "WEEK" || mode === "DAY") {
                setCurrentDate(startOfMonth(currentDate));
              }
            }

            setViewMode(mode);
          }}
        />
      </div>

      <div className="relative flex-1 overflow-hidden">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="relative h-full w-full overflow-hidden">
            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={direction}
            >
              {viewMode === "MONTH" && (
                <motion.div
                  key={`month-${currentDate.getFullYear()}-${currentDate.getMonth()}`}
                  custom={direction}
                  variants={{
                    enter: (dir: number) => ({
                      x: dir > 0 ? "100%" : dir < 0 ? "-100%" : 0,
                      opacity: 0,
                    }),
                    center: {
                      x: 0,
                      opacity: 1,
                    },
                    exit: (dir: number) => ({
                      x: dir > 0 ? "-100%" : dir < 0 ? "100%" : 0,
                      opacity: 0,
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 },
                  }}
                  className="absolute inset-0"
                >
                  <MonthView
                    currentDate={currentDate}
                    entries={calendarEntries}
                    onTaskClick={handleTaskClick}
                    onCellClick={handleCellClick}
                    onViewDay={handleViewDay}
                    onCardClick={handleCardClick}
                    cards={cards || []}
                    formattedResult={formattedResult || []}
                  />
                </motion.div>
              )}

              {viewMode === "WEEK" && (
                <motion.div
                  key={`week-${currentDate.toISOString()}`}
                  custom={direction}
                  variants={{
                    enter: (dir: number) => ({
                      x: dir > 0 ? "100%" : dir < 0 ? "-100%" : 0,
                      opacity: 0,
                    }),
                    center: {
                      x: 0,
                      opacity: 1,
                    },
                    exit: (dir: number) => ({
                      x: dir > 0 ? "-100%" : dir < 0 ? "100%" : 0,
                      opacity: 0,
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 },
                  }}
                  className="absolute inset-0"
                >
                  <WeekView
                    currentDate={currentDate}
                    entries={calendarEntries}
                    onTaskClick={handleTaskClick}
                    onCardClick={handleCardClick}
                    onCellClick={handleCellClick}
                    onViewDay={handleViewDay}
                    cards={cards || []}
                    formattedResult={formattedResult || []}
                  />
                </motion.div>
              )}

              {viewMode === "DAY" && (
                <motion.div
                  key={`day-${currentDate.toISOString()}`}
                  custom={direction}
                  variants={{
                    enter: (dir: number) => ({
                      x: dir > 0 ? "100%" : dir < 0 ? "-100%" : 0,
                      opacity: 0,
                    }),
                    center: {
                      x: 0,
                      opacity: 1,
                    },
                    exit: (dir: number) => ({
                      x: dir > 0 ? "-100%" : dir < 0 ? "100%" : 0,
                      opacity: 0,
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 },
                  }}
                  className="absolute inset-0"
                >
                  <DayView
                    currentDate={currentDate}
                    entries={calendarEntries}
                    onCardClick={handleCardClick}
                    onTaskClick={handleTaskClick}
                    onCellClick={handleCellClick}
                    cards={cards || []}
                    formattedResult={formattedResult || []}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </DragDropContext>
      </div>

      <EventDetailModal
        isVisible={isDetailOpen}
        entry={detailEntry}
        onClose={handleDetailClose}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteEvent}
        isDeleting={deleteMutation.isPending}
      />

      <CreateEventModal
        isVisible={isFormOpen}
        selectedDate={selectedDate}
        onClose={handleFormClose}
        onSave={handleCreateEvent}
        onUpdate={handleUpdateEvent}
        onSuccess={() => setIsSuccessOpen(true)}
        editEntry={editEntry}
      />

      <SuccessModal
        isVisible={isSuccessOpen}
        onClose={() => setIsSuccessOpen(false)}
        title={successData.title}
        message={successData.message}
      />

      {/* Custom Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmEntry && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmEntry(null)}
              className="absolute inset-0 bg-black/30 backdrop-blur-[3px]"
            />
            {/* Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/40 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900"
            >
              {/* Icon */}
              <div className="flex flex-col items-center px-8 pb-4 pt-8">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 shadow-lg shadow-red-500/10">
                  <svg
                    className="h-7 w-7 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-black text-neutral-900 dark:text-white">
                  Xóa công việc
                </h3>
                <p className="mt-1.5 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                    "{deleteConfirmEntry.title}"
                  </span>
                </p>
              </div>

              {/* Options */}
              <div className="flex flex-col gap-2 px-6 pb-6">
                {/* <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const e = deleteConfirmEntry;
                    setDeleteConfirmEntry(null);
                    handleDeleteEvent(e, "single");
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 px-5 py-3.5 text-left transition-all hover:border-neutral-200 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800/50 dark:hover:bg-neutral-800"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <svg
                      className="h-4.5 w-4.5 text-orange-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-neutral-900 dark:text-white">
                      This occurrence only
                    </p>
                    <p className="text-xs text-neutral-400">
                      Remove only the selected date
                    </p>
                  </div>
                </motion.button> */}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    const e = deleteConfirmEntry;
                    setDeleteConfirmEntry(null);
                    handleDeleteEvent(e, "all");
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 px-5 py-3.5 text-left transition-all hover:border-red-200 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:hover:bg-red-900/30"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/40">
                    <svg
                      className="h-4.5 w-4.5 text-red-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4l16 16M4 20L20 4"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-black text-red-700 dark:text-red-400">
                      Tất cả các lần
                    </p>
                    <p className="text-xs text-red-400/80">
                      Xóa tất cả ngày trong lịch lặp lại
                    </p>
                  </div>
                </motion.button>

                <button
                  onClick={() => setDeleteConfirmEntry(null)}
                  className="mt-1 rounded-xl py-2 text-sm font-bold text-neutral-400 transition-all hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  Hủy
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <Modal
        isVisible={isCardModalOpen}
        centered
        hideDefaultStyles
        // onClose={() => setIsCardModalOpen(false)}
        modalSize="lg"
      >
        <CardDetailsModalContent
          cardId={activeCardId || ""}
          onClose={() => setIsCardModalOpen(false)}
        />
      </Modal>

      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
      >
        <NewWorkspaceForm />
      </Modal>
    </div>
  );
}
