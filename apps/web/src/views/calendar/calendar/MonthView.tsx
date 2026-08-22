import { isAfter, isBefore } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";

import {
  calendarDateKeyInAppZone,
  formatInAppCalendarZone,
} from "@kan/shared/utils";

import type { CalendarEntry } from "~/hooks/useRecurrence";
import { StrictModeDroppable as Droppable } from "~/components/StrictModeDroppable";
import {
  getAppCalendarMonthGridDays,
  getAppCalendarMonthRange,
  isSameAppCalendarDay,
  isSameAppCalendarMonth,
} from "~/utils/calendar";
import { DayCardPopover } from "./DayCardPopover";
import { DayTasksPopover } from "./DayTasksPopover";

interface Card {
  publicId: string;
  dueDate: Date | null;
  startDate: Date | null;
  createdAt: Date;
}

interface MonthViewProps {
  currentDate: Date;
  entries: CalendarEntry[];
  onTaskClick: (entry: CalendarEntry) => void;
  onCellClick: (date: Date) => void;
  onViewDay: (date: Date) => void;
  onCardClick: (card: any) => void;
  cards: Card[];
  formattedResult: any[];
}

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function MonthView({
  currentDate,
  entries,
  onTaskClick,
  onCellClick,
  onViewDay,
  onCardClick,
  cards,
  formattedResult,
}: MonthViewProps) {
  const { from: monthStart } = getAppCalendarMonthRange(currentDate);
  const [popoverCard, setPopoverCard] = useState<Date | null>(null);
  const [popoverDay, setPopoverDay] = useState<Date | null>(null);

  const days = useMemo(
    () => getAppCalendarMonthGridDays(currentDate),
    [currentDate],
  );

  const getEntriesForDay = (day: Date) => {
    return entries
      .filter((entry) => isSameAppCalendarDay(entry.date, day))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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
      <div className="grid grid-cols-7 border-b border-light-200 dark:border-dark-300">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="text-neutral-1000 dark:text-neutral-1000 p-3 text-center text-[10px] font-black uppercase tracking-[0.2em]"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid h-full flex-1 grid-cols-7 grid-rows-6 overflow-hidden border-t border-dark-400 dark:border-dark-600">
        {days.map((day) => {
          const isCurrentMonth = isSameAppCalendarMonth(day, monthStart);
          const isDayToday = isSameAppCalendarDay(day, new Date());
          const dayEntries = getEntriesForDay(day);
          const droppableId = `droppable-${calendarDateKeyInAppZone(day)}`;
          const dayCards = getCardsForDay(day);

          return (
            <motion.div
              layout
              key={day.toISOString()}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => onCellClick(day)}
              className={`group relative flex min-h-0 cursor-pointer flex-col border-b border-r border-dark-200/50 p-1 transition-all duration-300 hover:bg-blue-50/40 dark:border-neutral-800 dark:hover:bg-blue-900/10 ${
                !isCurrentMonth
                  ? "bg-neutral-50/20 text-neutral-300 dark:bg-neutral-900/5 dark:text-neutral-600"
                  : "bg-white dark:bg-neutral-900"
              }`}
            >
              <div className="flex h-6 items-center justify-between pb-1">
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewDay(day);
                  }}
                  className={`flex h-4 w-8 cursor-pointer items-center justify-center rounded-xl text-[10px] font-black transition-all hover:bg-blue-600 hover:text-white hover:shadow-sm dark:text-neutral-100 dark:hover:bg-blue-600 ${
                    isDayToday
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                      : isCurrentMonth
                        ? "text-neutral-900 hover:bg-blue-600"
                        : "text-neutral-500 dark:text-neutral-700 dark:hover:text-white"
                  }`}
                >
                  {formatInAppCalendarZone(day, "d")}
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
                    className="flex flex-1 flex-col items-center justify-center space-y-1 overflow-y-auto overflow-x-hidden"
                  >
                    {/* {dayEntries.slice(0, 3).map((entry, idx) => (
                      <CalendarTask
                        key={entry.id}
                        entry={entry}
                        onClick={onTaskClick}
                        index={idx}
                      />
                    ))} */}
                    {isCurrentMonth && dayEntries.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopoverDay(day);
                        }}
                        className="mt-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-600 ring-1 ring-blue-500/20 transition-all hover:bg-blue-100 dark:bg-blue-600/30 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white"
                      >
                        {dayEntries.length} công việc hằng ngày
                      </button>
                    )}
                    {provided.placeholder}
                    {isCurrentMonth && dayCards.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPopoverCard(day);
                        }}
                        className="mt-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-600 ring-1 ring-amber-500/20 transition-all hover:bg-amber-100 dark:bg-amber-600/30 dark:text-amber-500 dark:hover:bg-amber-600 dark:hover:text-white"
                      >
                        {dayCards.length} công việc khác
                      </button>
                    )}
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
