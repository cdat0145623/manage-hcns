/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { t } from "@lingui/core/macro";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  HiChevronLeft,
  HiChevronRight,
  HiMiniPlus,
  HiXMark,
} from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

interface DueDateSelectorProps {
  cardPublicId: string;
  dueDate: Date | null | undefined;
  isLoading?: boolean;
  disabled?: boolean;
  onDateSelect?: (date: Date | undefined) => void;
  weekStartsOn?: 0 | 1 | 6;
}

export function DueDateSelector({
  dueDate,
  isLoading = false,
  disabled = false,
  onDateSelect,
  weekStartsOn = 1,
}: DueDateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [currentMonth, setCurrentMonth] = useState(() =>
    dueDate ? startOfMonth(dueDate) : startOfMonth(new Date()),
  );
  const [hour, setHour] = useState(() =>
    dueDate ? String(dueDate.getHours()).padStart(2, "0") : "00",
  );
  const [minute, setMinute] = useState(() =>
    dueDate ? String(dueDate.getMinutes()).padStart(2, "0") : "00",
  );
  const minuteRef = useRef<HTMLInputElement>(null);

  // Sync time when dueDate prop changes externally
  useEffect(() => {
    if (dueDate) {
      setHour(String(dueDate.getHours()).padStart(2, "0"));
      setMinute(String(dueDate.getMinutes()).padStart(2, "0"));
      setCurrentMonth(startOfMonth(dueDate));
    }
  }, [dueDate]);

  // Calculate dropdown position when opening
  const openDropdown = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + window.scrollY + rect.width / 2 - 160,
      left: rect.left + window.scrollX + 170,
    });
    setIsOpen(true);
  };

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + window.scrollY + rect.width / 2 - 160,
        left: rect.left + window.scrollX + 40,
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
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const monthName = format(currentMonth, "MMM yyyy");

  const dayHeaders = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn });
    return eachDayOfInterval({
      start: weekStart,
      end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000),
    }).map((d) => format(d, "EEEEEE"));
  }, [weekStartsOn]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd }).map(
      (date) => ({
        date: format(date, "yyyy-MM-dd"),
        isToday: isToday(date),
        isSelected: dueDate ? isSameDay(date, dueDate) : false,
        isCurrentMonth: date >= monthStart && date <= monthEnd,
        dateObj: date,
      }),
    );
  }, [currentMonth, dueDate, weekStartsOn]);

  const buildDate = (dateObj: Date) => {
    const h = Math.min(23, Math.max(0, parseInt(hour, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(minute, 10) || 0));
    const result = new Date(dateObj);
    result.setHours(h, m, 0, 0);
    return result;
  };

  const handleDayClick = (dateObj: Date, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dueDate && isSameDay(dateObj, dueDate)) {
      onDateSelect?.(undefined);
    } else {
      onDateSelect?.(buildDate(dateObj));
    }
  };

  const handleTimeChange = (type: "hour" | "minute", value: string) => {
    const numVal = value.replace(/\D/g, "").slice(0, 2);

    if (type === "hour") {
      setHour(numVal);
      if (type === "hour" && numVal.length === 2) {
        minuteRef.current?.focus();
        minuteRef.current?.select();
      }
    } else {
      setMinute(numVal);
    }

    if (!dueDate) return;

    // Chỉ update date khi đã nhập đủ 2 chữ số
    if (numVal.length < 2) return;

    const h =
      type === "hour"
        ? Math.min(23, parseInt(numVal, 10))
        : Math.min(23, parseInt(hour, 10) || 0);
    const m =
      type === "minute"
        ? Math.min(59, parseInt(numVal, 10))
        : Math.min(59, parseInt(minute, 10) || 0);

    const updated = new Date(dueDate);
    updated.setHours(h, m, 0, 0);
    onDateSelect?.(updated);
  };

  const handleBlurPad = (type: "hour" | "minute") => {
    // Khi blur: pad + commit luôn dù chưa đủ 2 chữ số
    const h =
      type === "hour"
        ? Math.min(23, parseInt(hour || "0", 10))
        : Math.min(23, parseInt(hour || "0", 10));
    const m =
      type === "minute"
        ? Math.min(59, parseInt(minute || "0", 10))
        : Math.min(59, parseInt(minute || "0", 10));

    if (type === "hour") setHour(String(h).padStart(2, "0"));
    else setMinute(String(m).padStart(2, "0"));

    if (!dueDate) return;

    const updated = new Date(dueDate);
    updated.setHours(h, m, 0, 0);
    onDateSelect?.(updated);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDateSelect?.(undefined);
    setIsOpen(false);
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
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={hour}
                onChange={(e) => handleTimeChange("hour", e.target.value)}
                onBlur={() => handleBlurPad("hour")}
                disabled={!dueDate}
                className="w-10 rounded border border-light-200 bg-transparent px-1.5 py-1 text-center font-mono text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-light-500 disabled:opacity-40 dark:border-dark-300 dark:text-dark-1000 dark:focus:ring-dark-500"
              />
              <span className="text-xs font-bold text-neutral-900 dark:text-dark-900">
                :
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={minute}
                onChange={(e) => handleTimeChange("minute", e.target.value)}
                onBlur={() => handleBlurPad("minute")}
                disabled={!dueDate}
                className="w-10 rounded border border-light-200 bg-transparent px-1.5 py-1 text-center font-mono text-xs text-neutral-900 focus:outline-none focus:ring-1 focus:ring-light-500 disabled:opacity-40 dark:border-dark-300 dark:text-dark-1000 dark:focus:ring-dark-500"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={handleClear}
                  title={t`Clear`}
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded text-light-500 hover:bg-light-100 hover:text-light-800 dark:text-dark-500 dark:hover:bg-dark-200 dark:hover:text-dark-900"
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
          !disabled &&
          !isLoading &&
          (isOpen ? setIsOpen(false) : openDropdown())
        }
        disabled={isLoading || disabled}
        className={`flex h-full w-full items-center rounded-[5px] border-[1px] border-light-50 py-1 pl-2 text-left text-xs text-neutral-900 dark:border-dark-50 dark:text-dark-1000 ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "hover:border-light-300 hover:bg-light-200 dark:hover:border-dark-200 dark:hover:bg-dark-100"
        }`}
      >
        {dueDate ? (
          <span>{format(dueDate, "MMM d, yyyy HH:mm")}</span>
        ) : (
          <>
            <HiMiniPlus size={22} className="pr-2" />
            {t`Set due date`}
          </>
        )}
      </button>
      {dropdown}
    </div>
  );
}
