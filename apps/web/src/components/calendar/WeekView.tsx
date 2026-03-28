import {
  addHours,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { CalendarTask } from "./CalendarTask";

interface WeekViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ currentDate, entries, onTaskClick }: WeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );

  const getEntriesForDay = (day: Date) => {
    return entries.filter((entry) => isSameDay(new Date(entry.date), day));
  };

  // For Now Indicator
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nowTop = (now.getHours() * 96) + (now.getMinutes() * 96 / 60);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with Alignment Spacer */}
      <div className="flex border-b border-light-200 bg-light-100/50 pr-4 transition-all dark:border-dark-300 dark:bg-dark-200/50">
        <div className="w-16 flex-shrink-0 border-r border-light-100 dark:border-dark-300" />
        <div className="flex flex-1">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`flex flex-1 flex-col items-center justify-center p-2 transition-all ${
                isToday(day) ? "relative" : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">
                {format(day, "EEE")}
              </span>
              <div className="relative mt-1">
                <span
                  className={`flex h-10 w-10 items-center justify-center text-xl font-black transition-all ${
                    isToday(day)
                      ? "text-primary-600 dark:text-primary-400"
                      : "text-neutral-900 dark:text-white"
                  }`}
                >
                  {format(day, "d")}
                </span>
                {isToday(day) && (
                  <motion.div 
                    layoutId="today-underline"
                    animate={{ 
                      scaleX: [1, 1.1, 1],
                      boxShadow: [
                        "0 2px 10px rgba(59,130,246,0.3)",
                        "0 2px 20px rgba(59,130,246,0.6)",
                        "0 2px 10px rgba(59,130,246,0.3)"
                      ]
                    }}
                    transition={{ 
                      repeat: Infinity, 
                      duration: 3, 
                      ease: "easeInOut" 
                    }}
                    className="absolute -bottom-1 left-0 right-0 h-1 rounded-full bg-gradient-to-r from-primary-500 to-primary-300" 
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full pt-8">
          {/* Time gutter */}
          <div className="w-16 flex-shrink-0 border-r border-light-100 bg-neutral-50/30 dark:border-dark-300 dark:bg-neutral-900/10">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative h-24 border-b border-light-100/50 dark:border-dark-200/50"
              >
                <span className="absolute -top-2 left-0 w-full pr-2 text-right text-[10px] font-bold uppercase tracking-tighter text-neutral-400 dark:text-neutral-600">
                  {format(addHours(startOfDay(new Date()), hour), "HH:00")}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const dayEntries = getEntriesForDay(day);
            const droppableId = `droppable-${format(day, "yyyy-MM-dd")}`;

            return (
              <div
                key={day.toISOString()}
                className={`relative flex min-w-0 flex-1 flex-col border-r border-light-100 transition-colors dark:border-dark-300 ${
                  isToday(day)
                    ? "bg-gradient-to-b from-primary-500/5 to-transparent dark:from-primary-500/10"
                    : ""
                }`}
              >
                {/* Hour dividers */}
                <div className="absolute inset-x-0 h-full">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-24 border-b border-light-100/50 dark:border-dark-200/50"
                    />
                  ))}
                </div>

                {/* Now Indicator with Animation */}
                {isToday(day) && (
                  <motion.div 
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    className="pointer-events-none absolute left-0 right-0 z-30 flex items-center origin-left"
                    style={{ top: `${nowTop}px` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                  >
                    <div className="h-0.5 flex-1 bg-red-500 shadow-[0_1px_2px_rgba(239,68,68,0.3)]" />
                  </motion.div>
                )}

                <Droppable droppableId={droppableId} type="TASK">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`relative h-full transition-colors ${
                        snapshot.isDraggingOver
                          ? "bg-primary-500/10 dark:bg-primary-500/5"
                          : ""
                      }`}
                      style={{ height: `${24 * 96}px` }}
                    >
                      {dayEntries.map((entry, index) => (
                        <CalendarTask
                          key={entry.id}
                          entry={entry}
                          onClick={onTaskClick}
                          isPositioned={true}
                          index={index}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
