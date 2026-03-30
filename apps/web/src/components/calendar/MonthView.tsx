import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { motion } from "framer-motion";
import { useMemo } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { CalendarTask } from "./CalendarTask";

interface MonthViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
  onCellClick: (date: Date) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthView({
  currentDate,
  entries,
  onTaskClick,
  onCellClick,
}: MonthViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = useMemo(
    () => eachDayOfInterval({ start: calendarStart, end: calendarEnd }),
    [calendarStart, calendarEnd],
  );

  const getEntriesForDay = (day: Date) => {
    return entries.filter((entry) => isSameDay(new Date(entry.date), day));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b border-light-200 dark:border-dark-300">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="p-2 text-center text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-500"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid flex-1 auto-rows-fr grid-cols-7 grid-rows-6 overflow-y-auto">
        {days.map((day, index) => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isDayToday = isToday(day);
          const dayEntries = getEntriesForDay(day);
          const droppableId = `droppable-${format(day, "yyyy-MM-dd")}`;

          return (
            <motion.div
              layout
              key={day.toISOString()}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: (index % 7) * 0.05 }}
              onClick={() => onCellClick(day)}
              className={`group relative flex min-h-[120px] cursor-pointer flex-col border-b border-r border-light-100 p-1 transition-all hover:bg-blue-50/30 dark:border-dark-300 dark:hover:bg-blue-900/10 ${
                !isCurrentMonth
                  ? "bg-neutral-50/30 dark:bg-neutral-900/10"
                  : "bg-white dark:bg-neutral-800"
              } ${
                isDayToday
                  ? "border-t-primary-500 border-t-[3px] shadow-[inset_0_10px_20px_-15px_rgba(59,130,246,0.3)]"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between p-1">
                <span
                  className={`flex h-7 w-7 items-center justify-center text-xs font-bold transition-all ${
                    isDayToday
                      ? "text-primary-600 dark:text-primary-400"
                      : isCurrentMonth
                        ? "text-neutral-900 dark:text-neutral-100"
                        : "text-neutral-400 dark:text-neutral-600"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {isDayToday && (
                  <motion.span
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{
                      repeat: Infinity,
                      duration: 2,
                      ease: "easeInOut",
                    }}
                    className="bg-primary-500/10 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-tighter"
                  >
                    Today
                  </motion.span>
                )}
              </div>

              <Droppable droppableId={droppableId} type="TASK">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 space-y-1 overflow-y-auto overflow-x-hidden transition-colors ${
                      snapshot.isDraggingOver
                        ? "bg-primary-500/10 dark:bg-primary-500/5 rounded-md"
                        : ""
                    }`}
                  >
                    {dayEntries.map((entry, idx) => (
                      <CalendarTask
                        key={entry.id}
                        entry={entry}
                        onClick={onTaskClick}
                        index={idx}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
