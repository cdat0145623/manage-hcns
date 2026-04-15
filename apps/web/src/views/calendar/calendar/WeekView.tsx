import {
  addHours,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import { calculateOverlap } from "~/utils/calendar";
import { CalendarTask } from "./CalendarTask";
import { DayCardPopover } from "./DayCardPopover";
import { DayTasksPopover } from "./DayTasksPopover";

interface Card {
  publicId: string;
  dueDate: Date | null;
  startDate: Date | null;
  createdAt: Date;
}

interface WeekViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
  onCardClick: (card: any) => void;
  onCellClick: (date: Date) => void;
  onViewDay: (date: Date) => void;
  cards: Card[];
  formattedResult: any[];
}

const DEFAULT_START_HOUR = 8;

export function WeekView({
  currentDate,
  entries,
  onTaskClick,
  onCardClick,
  onCellClick,
  onViewDay,
  cards,
  formattedResult,
}: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);
  const [popoverCard, setPopoverCard] = useState<Date | null>(null);

  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd],
  );

  const getEntriesForDay = (day: Date) => {
    return entries
      .filter((entry) => isSameDay(new Date(entry.date), day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startHour = useMemo(() => {
    if (entries.length === 0) return DEFAULT_START_HOUR;
    const earliestTaskHour = Math.min(
      ...entries.map((e) => new Date(e.date).getHours()),
    );
    return Math.min(DEFAULT_START_HOUR, earliestTaskHour);
  }, [entries]);

  const hoursToRender = useMemo(() => {
    return Array.from({ length: 24 - startHour }, (_, i) => i + startHour);
  }, [startHour]);

  const nowTop =
    (now.getHours() - startHour) * 128 + (now.getMinutes() * 128) / 60;

  const handleTimeSlotClick = (day: Date, hour: number) => {
    const clickedDate = new Date(day);
    clickedDate.setHours(hour, 0, 0, 0);
    onCellClick(clickedDate);
  };

  const getCardsForDay = (day: Date) => {
    const cardMetas = cards.filter(
      (card) =>
        isAfter(card.dueDate ?? endOfMonth(day), day) &&
        isBefore(card.startDate || card.createdAt, day),
    );

    // Resolve full card data from formattedResult
    const fullCards: any[] = [];
    formattedResult.forEach((board: any) => {
      board.lists.forEach((list: any) => {
        list.cards.forEach((card: any) => {
          if (cardMetas.some((m) => m.publicId === card.publicId)) {
            fullCards.push({
              ...card,
              boardName: board.name,
              listName: list.name,
            });
          }
        });
      });
    });

    return fullCards.sort(
      (a, b) =>
        new Date(a.dueDate ?? endOfMonth(day)).getTime() -
        new Date(b.dueDate ?? endOfMonth(day)).getTime(),
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex border-b border-light-300 bg-light-200/50 pr-4 transition-all dark:border-dark-300 dark:bg-dark-200/50">
        <div className="w-16 flex-shrink-0 border-r border-light-200 dark:border-dark-300" />
        <div className="flex flex-1">
          {days.map((day) => {
            const dayEntries = getEntriesForDay(day);
            const dayCards = getCardsForDay(day);
            return (
              <div
                key={day.toISOString()}
                className={`flex flex-1 cursor-pointer flex-col items-center justify-start p-2 transition-all ${
                  isToday(day)
                    ? "relative"
                    : "text-neutral-500 dark:text-neutral-600"
                }`}
                onClick={() => onCellClick(day)}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-900">
                  {["CN", "T2", "T3", "T4", "T5", "T6", "T7"][day.getDay()]}
                </span>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDay(day);
                  }}
                  className={`mt-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-lg font-black transition-all ${
                    isToday(day)
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                      : "border border-neutral-100 bg-white text-neutral-900 shadow-sm hover:bg-blue-600 hover:text-white hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="flex flex-col items-center justify-center gap-1">
                  {dayEntries.length > 0 && (
                    <motion.button
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopoverDay(day);
                      }}
                      className="mt-1.5 gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-600 ring-1 ring-blue-500/20 transition-all hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                    >
                      {/* <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                      </span> */}
                      {dayEntries.length} công việc hằng ngày
                    </motion.button>
                  )}
                  {dayCards.length > 0 && (
                    <motion.button
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPopoverCard(day);
                      }}
                      className="mt-1.5 gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-black text-amber-600 ring-1 ring-amber-500/20 transition-all hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400"
                    >
                      {/* <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                      </span> */}
                      {dayCards.length} công việc khác
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full pt-8">
          <div className="w-16 flex-shrink-0 border-r border-light-300 bg-neutral-100/30 dark:border-dark-600 dark:bg-neutral-900/10">
            {hoursToRender.map((hour) => (
              <div
                key={hour}
                className="relative h-32 border-b border-neutral-100/30 dark:border-white/5"
              >
                <span className="absolute -top-3 left-0 w-full pr-4 text-right text-[10px] font-black uppercase tracking-tighter text-neutral-600 dark:text-neutral-600">
                  {format(addHours(startOfDay(currentDate), hour), "H:mm")}
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEntries = getEntriesForDay(day);
            const overlapInfoMap = calculateOverlap(dayEntries);
            const droppableId = `droppable-${format(day, "yyyy-MM-dd")}`;

            return (
              <div
                key={day.toISOString()}
                className={`relative flex min-w-0 flex-1 flex-col border-r border-dark-400 transition-colors dark:border-dark-400 ${
                  isToday(day)
                    ? "from-primary-500/5 dark:from-primary-500/10 bg-gradient-to-b to-transparent"
                    : ""
                }`}
              >
                <div className="absolute inset-x-0 h-full">
                  {hoursToRender.map((hour) => (
                    <div
                      key={hour}
                      className="h-32 border-b border-dark-400 dark:border-white/5"
                    />
                  ))}
                </div>

                {isToday(day) && (
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
                      style={{ height: `${(24 - startHour) * 96}px` }}
                    >
                      <div className="absolute inset-x-0 z-0 h-full">
                        {hoursToRender.map((hour) => (
                          <div
                            key={`slot-${hour}`}
                            onClick={() => handleTimeSlotClick(day, hour)}
                            className="h-32 cursor-pointer transition-colors hover:bg-blue-100/30 dark:hover:bg-blue-900/20"
                          />
                        ))}
                      </div>

                      {(() => {
                        const renderedEntries = dayEntries.filter(
                          (e) =>
                            (overlapInfoMap.get(e.id)?.overlapIndex ?? 0) < 2,
                        );
                        const hiddenEntries = dayEntries.filter(
                          (e) =>
                            (overlapInfoMap.get(e.id)?.overlapIndex ?? 0) >= 2,
                        );
                        const hiddenCount = hiddenEntries.length;

                        // Calculate Y position for badge: position at the top of the first hidden task
                        const firstHidden = hiddenEntries[0];
                        const hourHeight = 128;
                        const badgeTop = firstHidden
                          ? (() => {
                              const d = new Date(firstHidden.date);
                              return (
                                (d.getHours() - startHour) * hourHeight +
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
                                  startHour={startHour}
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
                                  setPopoverDay(day);
                                }}
                                style={{
                                  top: `${badgeTop + 4}px`,
                                  right: "4px",
                                }}
                                className="absolute z-[250] flex h-7 w-fit items-center gap-1.5 rounded-full border border-blue-200 bg-white/95 px-2.5 py-1 shadow-lg backdrop-blur-md transition-all hover:bg-blue-50 dark:border-white/10 dark:bg-neutral-800/95"
                              >
                                <span className="relative flex h-1.5 w-1.5">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                                </span>
                                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">
                                  +{hiddenCount}
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
            );
          })}
        </div>
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
      <AnimatePresence>
        {popoverCard && (
          <DayCardPopover
            day={popoverCard}
            cards={getCardsForDay(popoverCard)}
            onClose={() => setPopoverCard(null)}
            onCardClick={onCardClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
