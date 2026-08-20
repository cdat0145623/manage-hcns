/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { t } from "@lingui/core/macro";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiChevronLeft,
  HiChevronRight,
  HiMiniPlus,
  HiXMark,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import {
  buildInstantFromAppCalendarDayAndTime,
  formatInAppCalendarZone,
} from "@kan/shared/utils";

import { useLocalisation } from "~/hooks/useLocalisation";

const minutesToTime = (mins: number) => {
  const clamped = Math.min(mins, 24 * 60 - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};

interface DueDateSelectorProps {
  cardPublicId: string;
  dueDate: Date | null | undefined;
  isLoading?: boolean;
  disabled?: boolean;
  onDateSelect?: (date: Date | undefined) => void;
  weekStartsOn?: 0 | 1 | 6;
  label?: string;
  title?: string;
  className?: string;
}

export function DueDateSelector({
  dueDate,
  isLoading = false,
  disabled = false,
  onDateSelect,
  weekStartsOn = 1,
  label,
  title,
  className,
}: DueDateSelectorProps) {
  const { dateLocale } = useLocalisation();
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentMonth, setCurrentMonth] = useState(() =>
    dueDate ? startOfMonth(dueDate) : startOfMonth(new Date()),
  );

  const [pendingDate, setPendingDate] = useState<Date | undefined>(
    dueDate ?? undefined,
  );
  const [currentTime, setCurrentTime] = useState<string | null>(null);

  const [showTimeOptions, setShowTimeOptions] = useState(false);

  const lastCommittedDateRef = useRef<string | undefined>(
    dueDate?.toISOString(),
  );

  // Sync state with props when they change externally
  useEffect(() => {
    if (
      dueDate?.toISOString() !== lastCommittedDateRef.current ||
      (!dueDate && lastCommittedDateRef.current)
    ) {
      setPendingDate(dueDate ?? undefined);
      lastCommittedDateRef.current = dueDate?.toISOString();
    }
  }, [dueDate]);

  // Commit immediately on close if there are pending changes
  const handleClose = () => {
    if (isOpen) {
      setIsOpen(false);
      setShowTimeOptions(false);

      if (pendingDate && !currentTime) {
        const now = new Date();
        const timeStr = formatInAppCalendarZone(now, "HH:mm");
        const fullDate = buildDate(pendingDate, timeStr);
        if (
          fullDate &&
          !isNaN(fullDate.getTime()) &&
          fullDate.getTime() !== dueDate?.getTime()
        ) {
          onDateSelect?.(fullDate);
        }
      }

      // Reset currentTime on close to ensure next open shows --:--
      setCurrentTime(null);
    }
  };

  // Calculate dropdown position when opening
  const openDropdown = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + window.scrollX,
    });
    // Set current time to existing due date's time if present
    if (dueDate) {
      setCurrentTime(formatInAppCalendarZone(dueDate, "HH:mm"));
    } else {
      setCurrentTime(null);
    }
    setIsOpen(true);
  };

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      )
        return;

      // Inline thay vì gọi handleClose()
      setIsOpen(false);
      setShowTimeOptions(false);

      if (pendingDate && !currentTime) {
        const now = new Date();
        const timeStr = formatInAppCalendarZone(now, "HH:mm");
        const fullDate = buildDate(pendingDate, timeStr);
        if (
          fullDate &&
          !isNaN(fullDate.getTime()) &&
          fullDate.getTime() !== dueDate?.getTime()
        ) {
          onDateSelect?.(fullDate);
        }
      }
      setCurrentTime(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, pendingDate, currentTime, dueDate, onDateSelect]);

  const monthName = formatInAppCalendarZone(currentMonth, "MMM yyyy", {
    locale: dateLocale,
  });

  const dayHeaders = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn });
    return eachDayOfInterval({
      start: weekStart,
      end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
    }).map((d) => formatInAppCalendarZone(d, "EEEEEE", { locale: dateLocale }));
  }, [weekStartsOn]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map(
      (date) => ({
        date: formatInAppCalendarZone(date, "yyyy-MM-dd"),
        isToday: isToday(date),
        isSelected: pendingDate ? isSameDay(date, pendingDate) : false,
        isCurrentMonth: date >= monthStart && date <= monthEnd,
        dateObj: date,
      }),
    );
  }, [currentMonth, pendingDate, weekStartsOn]);

  const timeOptions = useMemo(() => {
    const options = [];
    for (let i = 0; i < 24 * 60; i += 30) {
      const val = minutesToTime(i);
      options.push({ value: val, label: val });
    }
    return options;
  }, []);

  const buildDate = (dateObj: Date, timeStr: string) => {
    if (isNaN(dateObj.getTime())) return null;
    return buildInstantFromAppCalendarDayAndTime(dateObj, timeStr);
  };

  const handleDayClick = (dateObj: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingDate && isSameDay(dateObj, pendingDate)) {
      setPendingDate(undefined);
    } else {
      setPendingDate(dateObj);
      if (currentTime) {
        const fullDate = buildDate(dateObj, currentTime);
        if (
          fullDate &&
          !isNaN(fullDate.getTime()) &&
          fullDate.getTime() !== dueDate?.getTime()
        ) {
          onDateSelect?.(fullDate);
        }
      }
    }
  };

  const handleTimeSelect = (timeStr: string) => {
    setCurrentTime(timeStr);
    setShowTimeOptions(false);
    if (pendingDate) {
      const fullDate = buildDate(pendingDate, timeStr);
      if (
        fullDate &&
        !isNaN(fullDate.getTime()) &&
        fullDate.getTime() !== dueDate?.getTime()
      ) {
        onDateSelect?.(fullDate);
      }
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDate(undefined);
    setCurrentTime(null);
    onDateSelect?.(undefined);
    if (isOpen) {
      setIsOpen(false);
      setShowTimeOptions(false);
    }
  };

  const dropdown = isOpen
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{ top: dropdownPos.top, left: dropdownPos.left }}
          className="fixed z-[9999] w-64 rounded-lg border border-light-200 bg-white shadow-xl dark:border-dark-300 dark:bg-dark-100"
        >
          {/* Month navigation */}
          <div className="flex items-center justify-between px-3 pt-3">
            <button
              type="button"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-900 hover:bg-light-100 dark:text-dark-700 dark:hover:bg-dark-200"
            >
              <HiChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold text-neutral-900 dark:text-dark-1000">
              {monthName}
            </span>
            <button
              type="button"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="flex h-6 w-6 items-center justify-center rounded text-neutral-900 hover:bg-light-100 dark:text-dark-700 dark:hover:bg-dark-200"
            >
              <HiChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="mt-2 grid grid-cols-7 px-3">
            {dayHeaders.map((d, i) => (
              <div
                key={i}
                className="text-center text-[10px] font-medium text-neutral-900 dark:text-dark-600"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="mt-1 grid grid-cols-7 px-3 pb-2">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                onClick={(e) => handleDayClick(day.dateObj, e)}
                className={twMerge(
                  "flex aspect-square items-center justify-center rounded text-[11px] focus:z-10",
                  day.isSelected
                    ? "bg-neutral-900 text-white dark:bg-dark-950 dark:text-dark-50"
                    : day.isToday
                      ? "font-bold text-neutral-900 hover:bg-light-100 dark:text-dark-1000 dark:hover:bg-dark-200"
                      : day.isCurrentMonth
                        ? "text-neutral-900 hover:bg-light-100 dark:text-dark-800 dark:hover:bg-dark-200"
                        : "text-neutral-500 hover:bg-light-100 dark:text-dark-500 dark:hover:bg-dark-200",
                )}
              >
                {day.date.split("-").pop()?.replace(/^0/, "")}
              </button>
            ))}
          </div>

          {/* Time picker */}
          <div className="border-t border-light-200 px-3 py-2 dark:border-dark-300">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-900 dark:text-dark-900">
              {t`Time`}
            </p>
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setShowTimeOptions(!showTimeOptions)}
                  disabled={!pendingDate}
                  className="flex w-full items-center justify-between rounded border border-light-200 bg-transparent px-2.5 py-1.5 text-center font-mono text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-light-500 disabled:opacity-40 dark:border-dark-300 dark:text-dark-1000 dark:focus:ring-dark-500"
                >
                  <span className="w-full">{currentTime ?? "--:--"}</span>
                </button>
                <AnimatePresence>
                  {showTimeOptions && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute bottom-full left-0 z-[10000] mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-light-200 bg-white py-1 shadow-2xl dark:border-dark-300 dark:bg-dark-100"
                    >
                      {timeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => handleTimeSelect(opt.value)}
                          className={twMerge(
                            "w-full px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-light-100 dark:hover:bg-dark-200",
                            currentTime === opt.value
                              ? "bg-light-50 font-bold text-neutral-900 dark:bg-dark-200 dark:text-white"
                              : "text-neutral-700 dark:text-dark-1000",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {pendingDate && (
                <button
                  type="button"
                  onClick={handleClear}
                  title={t`Clear`}
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded text-neutral-600 hover:bg-light-100 hover:text-neutral-900 dark:text-dark-500 dark:hover:bg-dark-200 dark:hover:text-dark-900"
                >
                  <HiXMark className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative flex w-full items-center text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() =>
          !disabled && !isLoading && (isOpen ? handleClose() : openDropdown())
        }
        disabled={isLoading || disabled}
        title={title}
        className={twMerge(
          "flex min-h-[34px] w-full items-center rounded-xl bg-white px-3 text-left text-[13px] font-medium text-neutral-900 shadow-sm ring-1 ring-light-300 transition-all hover:bg-light-50 hover:ring-light-400 dark:bg-dark-300/30 dark:text-dark-1000 dark:ring-dark-300/50 dark:hover:bg-dark-300/50",
          disabled && "cursor-not-allowed opacity-60",
          className,
        )}
      >
        {pendingDate ? (
          <span className="truncate">
            {formatInAppCalendarZone(pendingDate, "MMM d, yyyy HH:mm", {
              locale: dateLocale,
            })}
          </span>
        ) : (
          <>
            <HiMiniPlus size={16} className="mr-1.5 text-light-500" />
            <span className="truncate">{label}</span>
          </>
        )}
      </button>
      {dropdown}
    </div>
  );
}
