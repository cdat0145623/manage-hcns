import {
  addDays,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { CalendarTask } from "./CalendarTask";
import { DayTasksPopover } from "./DayTasksPopover";

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
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);

  const calendarStart = startOfWeek(monthStart);
  // BUG-4 FIX: Always generate 42 days (6 weeks) so months that start
  // near the end of a week (needing 6 rows) are never truncated
  const calendarEnd = addDays(calendarStart, 41);

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
            className="p-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300 dark:text-neutral-600"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid h-full flex-1 grid-cols-7 grid-rows-6 overflow-hidden border-t border-light-200 dark:border-dark-300">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isDayToday = isToday(day);
          const dayEntries = getEntriesForDay(day);
          const droppableId = `droppable-${format(day, "yyyy-MM-dd")}`;

          return (
            <motion.div
              layout
              key={day.toISOString()}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => onCellClick(day)}
              className={`group relative flex min-h-0 cursor-pointer flex-col border-b border-r border-neutral-50 p-1 transition-all duration-300 hover:bg-blue-50/40 dark:border-white/5 dark:hover:bg-blue-900/10 ${
                !isCurrentMonth
                  ? "bg-neutral-50/20 dark:bg-neutral-900/5 text-neutral-300 dark:text-neutral-600"
                  : [0, 6].includes(day.getDay())
                    ? "bg-neutral-50/40 dark:bg-neutral-900/50"
                    : "bg-white dark:bg-neutral-900"
              }`}
            >
              <div className="mb-1 flex items-center justify-between p-1.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-md font-black transition-all ${
                    isDayToday
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                      : isCurrentMonth
                        ? "text-neutral-900 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
                        : "text-neutral-200 dark:text-neutral-700 font-bold"
                  }`}
                >
                  {format(day, "d")}
                </div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white opacity-0 shadow-lg shadow-blue-500/30 transition-all group-hover:opacity-100"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                </motion.div>
              </div>

              <Droppable droppableId={droppableId} type="TASK">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden"
                  >
                    {dayEntries.slice(0, 3).map((entry, idx) => (
                      <CalendarTask
                        key={entry.id}
                        entry={entry}
                        onClick={onTaskClick}
                        index={idx}
                      />
                    ))}
                    {dayEntries.length > 3 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopoverDay(day);
                        }}
                        className="mt-1 flex w-full items-center justify-center rounded-md py-0.5 text-[9px] font-black text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-800"
                      >
                        +{dayEntries.length - 3} more
                      </button>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {popoverDay && (
          <DayTasksPopover
            day={popoverDay}
            entries={getEntriesForDay(popoverDay)}
            onClose={() => setPopoverDay(null)}
            onTaskClick={onTaskClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

