import { isAfter, isBefore } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import {
  buildInstantFromAppCalendarDayAndTime,
  calendarDateKeyInAppZone,
  formatInAppCalendarZone,
} from "@kan/shared/utils";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import {
  calculateWeekHourLayout,
  compareCalendarEntriesByTime,
  getAppCalendarMonthRange,
  getAppCalendarWeekDays,
  getCalendarHour,
  getCurrentTimeTop,
  isSameAppCalendarDay,
} from "~/utils/calendar";
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
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);
  const [popoverCard, setPopoverCard] = useState<Date | null>(null);

  const days = useMemo(() => {
    return getAppCalendarWeekDays(currentDate);
  }, [currentDate]);

  const entriesByDay = useMemo(
    () =>
      days.map((day) =>
        entries
          .filter((entry) => isSameAppCalendarDay(entry.date, day))
          .sort(compareCalendarEntriesByTime),
      ),
    [days, entries],
  );

  const getEntriesForDay = (day: Date) => {
    const dayIndex = days.findIndex((weekDay) =>
      isSameAppCalendarDay(weekDay, day),
    );
    return dayIndex >= 0 ? (entriesByDay[dayIndex] ?? []) : [];
  };

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startHour = useMemo(() => {
    const weekEntries = entriesByDay.flat();
    if (weekEntries.length === 0) return DEFAULT_START_HOUR;
    const earliestTaskHour = Math.min(
      ...weekEntries.map((entry) => getCalendarHour(entry.date)),
    );
    return Math.min(DEFAULT_START_HOUR, earliestTaskHour);
  }, [entriesByDay]);

  const hourLayout = useMemo(
    () => calculateWeekHourLayout(entriesByDay, startHour),
    [entriesByDay, startHour],
  );

  const calendarHeight = hourLayout.reduce(
    (total, { height }) => total + height,
    0,
  );

  const nowTop = getCurrentTimeTop(hourLayout, now);

  const handleTimeSlotClick = (day: Date, hour: number) => {
    const clickedDate = buildInstantFromAppCalendarDayAndTime(
      day,
      `${String(hour).padStart(2, "0")}:00`,
    );
    onCellClick(clickedDate);
  };

  const getCardsForDay = (day: Date) => {
    const cardMetas = cards.filter(
      (card) =>
        isAfter(card.dueDate ?? getAppCalendarMonthRange(day).to, day) &&
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
        new Date(a.dueDate ?? getAppCalendarMonthRange(day).to).getTime() -
        new Date(b.dueDate ?? getAppCalendarMonthRange(day).to).getTime(),
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
                  isSameAppCalendarDay(day, new Date())
                    ? "relative"
                    : "text-neutral-500 dark:text-neutral-600"
                }`}
                onClick={() => onCellClick(day)}
              >
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-900">
                  {
                    ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][
                      Number(formatInAppCalendarZone(day, "i")) % 7
                    ]
                  }
                </span>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDay(day);
                  }}
                  className={`mt-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-lg font-black transition-all ${
                    isSameAppCalendarDay(day, new Date())
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                      : "border border-neutral-100 bg-white text-neutral-900 shadow-sm hover:bg-blue-600 hover:text-white hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
                  }`}
                >
                  {formatInAppCalendarZone(day, "d")}
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
            {hourLayout.map(({ hour, height }) => (
              <div
                key={hour}
                className="relative border-b border-neutral-100/30 dark:border-white/5"
                style={{ height: `${height}px` }}
              >
                <span className="absolute -top-3 left-0 w-full pr-4 text-right text-[10px] font-black uppercase tracking-tighter text-neutral-600 dark:text-neutral-600">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const dayEntries = entriesByDay[dayIndex] ?? [];
            const draggableEntryIndexById = new Map(
              dayEntries
                .filter((entry) => entry.type !== "VIRTUAL")
                .map((entry, index) => [entry.id, index]),
            );
            const droppableId = `droppable-${calendarDateKeyInAppZone(day)}`;

            return (
              <div
                key={day.toISOString()}
                className={`relative flex min-w-0 flex-1 flex-col border-r border-dark-400 transition-colors dark:border-dark-400 ${
                  isSameAppCalendarDay(day, new Date())
                    ? "from-primary-500/5 dark:from-primary-500/10 bg-gradient-to-b to-transparent"
                    : ""
                }`}
                style={{ height: `${calendarHeight}px` }}
              >
                <div className="absolute inset-x-0 h-full">
                  {hourLayout.map(({ hour, height }) => (
                    <div
                      key={hour}
                      className="border-b border-dark-400 dark:border-white/5"
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>

                {isSameAppCalendarDay(day, new Date()) && nowTop !== null && (
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
                      style={{ height: `${calendarHeight}px` }}
                    >
                      <div className="absolute inset-x-0 z-0 h-full">
                        {hourLayout.map(({ hour, height }) => (
                          <div
                            key={`slot-${hour}`}
                            onClick={() => handleTimeSlotClick(day, hour)}
                            className="cursor-pointer transition-colors hover:bg-blue-100/30 dark:hover:bg-blue-900/20"
                            style={{ height: `${height}px` }}
                          />
                        ))}
                      </div>

                      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
                        {hourLayout.map(({ hour, height }) => {
                          const hourEntries = dayEntries.filter(
                            (entry) => getCalendarHour(entry.date) === hour,
                          );

                          return (
                            <div
                              key={`tasks-${hour}`}
                              className="flex flex-col gap-1 p-1"
                              style={{ height: `${height}px` }}
                            >
                              {hourEntries.map((entry) => (
                                <CalendarTask
                                  key={entry.id}
                                  entry={entry}
                                  onClick={onTaskClick}
                                  variant="DETAILED"
                                  index={
                                    draggableEntryIndexById.get(entry.id) ?? 0
                                  }
                                  isStacked
                                />
                              ))}
                            </div>
                          );
                        })}
                      </div>
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
