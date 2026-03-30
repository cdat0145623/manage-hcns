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
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { CalendarTask } from "./CalendarTask";

interface WeekViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
  onCellClick: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({
  currentDate,
  entries,
  onTaskClick,
  onCellClick,
}: WeekViewProps) {
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );

  const getEntriesForDay = (day: Date) => {
    return entries.filter((entry) => isSameDay(new Date(entry.date), day));
  };

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const nowTop = now.getHours() * 96 + (now.getMinutes() * 96) / 60;

  const handleTimeSlotClick = (day: Date, hour: number) => {
    const clickedDate = new Date(day);
    clickedDate.setHours(hour, 0, 0, 0);
    onCellClick(clickedDate);
  };
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b border-light-200 bg-light-100/50 pr-4 transition-all dark:border-dark-300 dark:bg-dark-200/50">
        <div className="w-16 flex-shrink-0 border-r border-light-100 dark:border-dark-300" />
        <div className="flex flex-1">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={`flex flex-1 cursor-pointer flex-col items-center justify-center p-2 transition-all ${
                isToday(day)
                  ? "relative"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
              onClick={() => onCellClick(day)}
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
                        "0 2px 10px rgba(59,130,246,0.3)",
                      ],
                    }}
                    transition={{
                      repeat: Infinity,
                      duration: 3,
                      ease: "easeInOut",
                    }}
                    className="from-primary-500 to-primary-300 absolute -bottom-1 left-0 right-0 h-1 rounded-full bg-gradient-to-r"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full pt-8">
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

          {days.map((day) => {
            const dayEntries = getEntriesForDay(day);
            const droppableId = `droppable-${format(day, "yyyy-MM-dd")}`;

            return (
              <div
                key={day.toISOString()}
                className={`relative flex min-w-0 flex-1 flex-col border-r border-light-100 transition-colors dark:border-dark-300 ${
                  isToday(day)
                    ? "from-primary-500/5 dark:from-primary-500/10 bg-gradient-to-b to-transparent"
                    : ""
                }`}
              >
                <div className="absolute inset-x-0 h-full">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="h-24 border-b border-light-100/50 dark:border-dark-200/50"
                    />
                  ))}
                </div>

                {isToday(day) && (
                  <motion.div
                    initial={{ opacity: 0, scaleX: 0 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    className="pointer-events-none absolute left-0 right-0 z-30 flex origin-left items-center"
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
                      <div className="absolute inset-x-0 z-0 h-full">
                        {HOURS.map((hour) => (
                          <div
                            key={`slot-${hour}`}
                            onClick={() => handleTimeSlotClick(day, hour)}
                            className="h-24 cursor-pointer transition-colors hover:bg-blue-100/30 dark:hover:bg-blue-900/20"
                          />
                        ))}
                      </div>

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
