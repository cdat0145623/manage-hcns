import {
  addHours,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isToday,
  startOfDay,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import {
  calculateDayHourLayout,
  compareCalendarEntriesByTime,
  getCurrentTimeTop,
} from "~/utils/calendar";
import { CalendarCard } from "./CalendarCard";
import { CalendarTask } from "./CalendarTask";
import { DayCardPopover } from "./DayCardPopover";
import { DayTasksPopover } from "./DayTasksPopover";

interface Card {
  publicId: string;
  dueDate: Date | null;
  startDate: Date | null;
  createdAt: Date;
}

interface DayViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
  onCellClick: (date: Date) => void;
  onCardClick: (card: any) => void;
  cards: Card[];
  formattedResult: any[];
}
const DEFAULT_START_HOUR = 8;

export function DayView({
  currentDate,
  entries,
  onTaskClick,
  onCellClick,
  onCardClick,
  cards,
  formattedResult,
}: DayViewProps) {
  const isDayToday = isToday(currentDate);
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);
  const [popoverCard, setPopoverCard] = useState<Date | null>(null);

  const dayEntries = useMemo(
    () =>
      entries
        .filter((entry) => isSameDay(new Date(entry.date), currentDate))
        .sort(compareCalendarEntriesByTime),
    [entries, currentDate],
  );
  const droppableId = `droppable-${format(currentDate, "yyyy-MM-dd")}`;

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const startHour = useMemo(() => {
    if (dayEntries.length === 0) return DEFAULT_START_HOUR;
    const earliestTaskHour = Math.min(
      ...dayEntries.map((e) => new Date(e.date).getHours()),
    );
    return Math.min(DEFAULT_START_HOUR, earliestTaskHour);
  }, [dayEntries]);

  const hourLayout = useMemo(
    () => calculateDayHourLayout(dayEntries, startHour),
    [dayEntries, startHour],
  );

  const calendarHeight = hourLayout.reduce(
    (total, { height }) => total + height,
    0,
  );

  const nowTop = getCurrentTimeTop(hourLayout, now);

  const handleTimeSlotClick = (hour: number) => {
    const clickedDate = new Date(currentDate);
    clickedDate.setHours(hour, 0, 0, 0);
    onCellClick(clickedDate);
  };

  const dayCards = useMemo(() => {
    const cardMetas = cards.filter(
      (card) =>
        isAfter(card.dueDate ?? endOfMonth(currentDate), currentDate) &&
        isBefore(card.startDate || card.createdAt, currentDate),
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
        new Date(a.dueDate ?? endOfMonth(currentDate)).getTime() -
        new Date(b.dueDate ?? endOfMonth(currentDate)).getTime(),
    );
  }, [cards, formattedResult, currentDate]);

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
              <div className="flex flex-col items-center justify-center gap-1">
                {dayEntries.length > 0 && (
                  <motion.button
                    initial={{ opacity: 0, x: 5 }}
                    animate={{ opacity: 1, x: 0 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setPopoverDay(currentDate)}
                    className="mt-1.5 gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-600 ring-1 ring-blue-500/20 transition-all hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {/* <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500"></span>
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
                      setPopoverCard(currentDate);
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
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex min-h-full pt-8">
          <div className="w-20 flex-shrink-0 border-r border-light-300 bg-neutral-50/30 dark:border-dark-300 dark:bg-neutral-900/10">
            {hourLayout.map(({ hour, height }) => (
              <div
                key={hour}
                className="relative border-b border-neutral-100/30 dark:border-white/5"
                style={{ height: `${height}px` }}
              >
                <span className="absolute -top-3 left-0 w-full pr-4 text-right text-[10px] font-black uppercase tracking-tighter text-neutral-600 dark:text-neutral-600">
                  {format(addHours(startOfDay(currentDate), hour), "H:mm")}
                </span>
              </div>
            ))}
          </div>

          <div
            className="relative flex-1 bg-white dark:bg-dark-100"
            style={{ height: `${calendarHeight}px` }}
          >
            <div className="pointer-events-none absolute inset-0">
              {hourLayout.map(({ hour, height }) => (
                <div
                  key={hour}
                  className="border-b border-dark-400 dark:border-white/5"
                  style={{ height: `${height}px` }}
                />
              ))}
            </div>

            {isDayToday && nowTop !== null && (
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
                    {hourLayout.map(({ hour, height }) => (
                      <div
                        key={`slot-${hour}`}
                        onClick={() => handleTimeSlotClick(hour)}
                        className="w-full cursor-pointer transition-colors hover:bg-blue-100/30 dark:hover:bg-blue-900/20"
                        style={{ height: `${height}px` }}
                      />
                    ))}
                  </div>

                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
                    {hourLayout.map(
                      ({ hour, height, entries: hourEntries }) => (
                        <div
                          key={`tasks-${hour}`}
                          className="flex flex-col gap-1 p-1"
                          style={{ height: `${height}px` }}
                        >
                          {hourEntries.map((entry, index) => (
                            <CalendarTask
                              key={entry.id}
                              entry={entry}
                              onClick={onTaskClick}
                              variant="DETAILED"
                              index={index}
                              isDraggable={false}
                              isStacked
                            />
                          ))}
                        </div>
                      ),
                    )}
                  </div>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Các công việc khác</h3>
          </div>
          {dayCards.map((card) => (
            <CalendarCard
              key={card.publicId}
              card={card}
              onClick={onCardClick}
              variant="DETAILED"
            />
          ))}
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
      <AnimatePresence>
        {popoverCard && (
          <DayCardPopover
            day={popoverCard}
            cards={dayCards}
            onClose={() => setPopoverCard(null)}
            onCardClick={onCardClick}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
