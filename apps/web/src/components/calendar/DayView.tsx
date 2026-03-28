import { addHours, format, isSameDay, isToday, startOfDay } from "date-fns";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { CalendarTask } from "./CalendarTask";

interface DayViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ currentDate, entries, onTaskClick }: DayViewProps) {
  const isDayToday = isToday(currentDate);
  const dayEntries = entries.filter((entry) =>
    isSameDay(new Date(entry.date), currentDate),
  );
  const droppableId = `droppable-${format(currentDate, "yyyy-MM-dd")}`;

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
      <div className="flex border-b border-light-200 bg-light-100/50 transition-all dark:border-dark-300 dark:bg-dark-200/50">
        <div className="w-20 flex-shrink-0 border-r border-light-200 dark:border-dark-300" />
        <div className="flex flex-col items-start gap-3 p-6">
          <div className="flex items-center gap-4">
            <span className="text-primary-500 font-black uppercase tracking-[0.2em] text-xs">
              {format(currentDate, "EEEE")}
            </span>
            {isDayToday && (
              <motion.div 
                layoutId="today-pill"
                initial={{ opacity: 0, scale: 0.9, x: -10 }}
                animate={{ 
                  opacity: 1, 
                  scale: 1, 
                  x: 0,
                  boxShadow: [
                    "0 0 0px rgba(59,130,246,0)",
                    "0 0 20px rgba(59,130,246,0.4)",
                    "0 0 0px rgba(59,130,246,0)"
                  ]
                }}
                transition={{
                  duration: 0.3,
                  boxShadow: { repeat: Infinity, duration: 4, ease: "easeInOut" }
                }}
                className="flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100/50 px-4 py-1.5 dark:border-primary-800 dark:bg-primary-900/30 backdrop-blur-sm shadow-sm"
              >
                <div className="h-2 w-2 rounded-full bg-primary-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary-600 dark:text-primary-400">
                  Today
                </span>
              </motion.div>
            )}
          </div>
          <h1
            className={`text-5xl font-black tracking-tighter transition-all ${
              isDayToday
                ? "from-primary-600 to-primary-400 dark:from-primary-400 dark:to-primary-600 bg-gradient-to-r bg-clip-text text-transparent"
                : "text-neutral-900 dark:text-white"
            }`}
          >
            {format(currentDate, "MMMM d, yyyy")}
          </h1>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full pt-8">
          {/* Time axis */}
          <div className="w-20 flex-shrink-0 border-r border-light-200 bg-neutral-50/30 dark:border-dark-300 dark:bg-neutral-900/10">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative h-24 border-b border-light-100 dark:border-dark-200"
              >
                <span className="absolute -top-3 left-0 w-full pr-3 text-right text-xs font-bold uppercase tracking-tighter text-neutral-400 dark:text-neutral-600">
                  {format(addHours(startOfDay(new Date()), hour), "HH:00")}
                </span>
              </div>
            ))}
          </div>

          {/* Detailed column - Absolute Container */}
          <div className="relative flex-1 bg-white dark:bg-dark-100" style={{ height: `${24 * 96}px` }}>
            {/* Hour lines background */}
            <div className="pointer-events-none absolute inset-0">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-24 border-b border-light-100/50 dark:border-dark-200/50"
                />
              ))}
            </div>

            {/* Now Indicator with Animation */}
            {isDayToday && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                style={{ top: `${nowTop}px` }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
              >
                <motion.div 
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="h-3 w-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" 
                />
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
                >
                  {dayEntries.map((entry, index) => (
                    <CalendarTask
                      key={entry.id}
                      entry={entry}
                      onClick={onTaskClick}
                      variant="DETAILED"
                      isPositioned={true}
                      index={index}
                    />
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </div>
    </div>
  );
}
