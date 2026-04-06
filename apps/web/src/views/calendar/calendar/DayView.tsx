import { addHours, format, isSameDay, isToday, startOfDay } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { calculateOverlap } from "~/utils/calendar";
import { CalendarTask } from "./CalendarTask";
import { DayTasksPopover } from "./DayTasksPopover";

interface DayViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
  onCellClick: (date: Date) => void;
}
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({
  currentDate,
  entries,
  onTaskClick,
  onCellClick,
}: DayViewProps) {
  const isDayToday = isToday(currentDate);
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);
  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => isSameDay(new Date(entry.date), currentDate))
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
    [entries, currentDate],
  );
  const overlapInfoMap = useMemo(
    () => calculateOverlap(dayEntries),
    [dayEntries],
  );
  const droppableId = `droppable-${format(currentDate, "yyyy-MM-dd")}`;

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const nowTop = now.getHours() * 96 + (now.getMinutes() * 96) / 60;

  const handleTimeSlotClick = (hour: number) => {
    const clickedDate = new Date(currentDate);
    clickedDate.setHours(hour, 0, 0, 0);
    onCellClick(clickedDate);
  };
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b border-light-300 bg-light-100/50 transition-all dark:border-dark-300 dark:bg-dark-200/50">
        <div className="w-20 flex-shrink-0 border-r border-light-300 dark:border-dark-300" />
        <div className="flex flex-col items-start gap-1 p-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-600">
              {
                [
                  "Chủ Nhật",
                  "Thứ Hai",
                  "Thứ Ba",
                  "Thứ Tư",
                  "Thứ Năm",
                  "Thứ Sáu",
                  "Thứ Bảy",
                ][currentDate.getDay()]
              }
            </span>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-2xl text-2xl font-black transition-all ${
                isDayToday
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                  : "border border-neutral-100 bg-white text-neutral-900 shadow-sm hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
              }`}
            >
              {format(currentDate, "d")}
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black text-neutral-900 dark:text-white">
                {format(currentDate, "MMMM yyyy")}
              </span>
              {dayEntries.length > 0 && (
                <motion.button
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setPopoverDay(currentDate)}
                  className="mt-3 flex w-fit items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-blue-600 ring-1 ring-blue-500/20 transition-all hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                  </span>
                  Xem tất cả {dayEntries.length} nhiệm vụ
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full pt-8">
          <div className="w-20 flex-shrink-0 border-r border-light-300 bg-neutral-50/30 dark:border-dark-300 dark:bg-neutral-900/10">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="relative h-24 border-b border-neutral-100/30 dark:border-white/5"
              >
                <span className="absolute -top-3 left-0 w-full pr-4 text-right text-[10px] font-black uppercase tracking-tighter text-neutral-600 dark:text-neutral-600">
                  {format(addHours(startOfDay(new Date()), hour), "h a")}
                </span>
              </div>
            ))}
          </div>

          <div
            className="relative flex-1 bg-white dark:bg-dark-100"
            style={{ height: `${24 * 96}px` }}
          >
            <div className="pointer-events-none absolute inset-0">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="h-24 border-b border-dark-400 dark:border-white/5"
                />
              ))}
            </div>

            {isDayToday && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                style={{ top: `${nowTop}px` }}
              >
                <div className="relative flex items-center">
                  <div className="absolute -left-[54px] z-40 rounded-full bg-rose-500/10 px-1.5 py-0.5 ring-1 ring-rose-500/20 backdrop-blur-sm">
                    <span className="text-[9px] font-black uppercase tracking-tighter text-rose-600 dark:text-rose-400">
                      Hiện tại
                    </span>
                  </div>
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)] ring-4 ring-rose-500/20" />
                </div>
                <div className="h-[2px] flex-1 bg-gradient-to-r from-rose-500 via-rose-500/40 to-transparent opacity-80" />
              </div>
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
                  <div className="absolute inset-0 z-0 flex flex-col">
                    {HOURS.map((hour) => (
                      <div
                        key={`slot-${hour}`}
                        onClick={() => handleTimeSlotClick(hour)}
                        className="h-24 w-full cursor-pointer transition-colors hover:bg-blue-100/30 dark:hover:bg-blue-900/20"
                      />
                    ))}
                  </div>

                  {(() => {
                    const renderedEntries = dayEntries.filter(
                      (e) => (overlapInfoMap.get(e.id)?.overlapIndex ?? 0) < 2,
                    );
                    const hiddenEntries = dayEntries.filter(
                      (e) => (overlapInfoMap.get(e.id)?.overlapIndex ?? 0) >= 2,
                    );
                    const hiddenCount = hiddenEntries.length;

                    // Calculate Y position for badge: position at the top of the first hidden task
                    const firstHidden = hiddenEntries[0];
                    const hourHeight = 96;
                    const badgeTop = firstHidden
                      ? (() => {
                          const d = new Date(firstHidden.date);
                          return (
                            d.getHours() * hourHeight +
                            (d.getMinutes() * hourHeight) / 60
                          );
                        })()
                      : 8;

                    return (
                      <>
                        {renderedEntries.map((entry, index) => {
                          const overlapInfo = overlapInfoMap.get(entry.id);
                          return (
                            <CalendarTask
                              key={entry.id}
                              entry={entry}
                              onClick={onTaskClick}
                              variant="DETAILED"
                              isPositioned={true}
                              totalOverlap={Math.min(
                                overlapInfo?.totalOverlap ?? 1,
                                2,
                              )}
                              overlapIndex={overlapInfo?.overlapIndex}
                              index={index}
                              isDraggable={false}
                            />
                          );
                        })}
                        {hiddenCount > 0 && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPopoverDay(currentDate);
                            }}
                            style={{ top: `${badgeTop + 4}px`, right: "12px" }}
                            className="absolute z-[250] flex h-8 w-fit items-center gap-2 rounded-full border border-blue-200 bg-white/95 px-3 py-1.5 shadow-xl backdrop-blur-md transition-all hover:bg-blue-50 dark:border-white/10 dark:bg-neutral-800/95"
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                              +{hiddenCount} khác
                            </span>
                          </motion.button>
                        )}
                      </>
                    );
                  })()}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {popoverDay && (
          <DayTasksPopover
            day={popoverDay}
            entries={dayEntries}
            onClose={() => setPopoverDay(null)}
            onTaskClick={onTaskClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
