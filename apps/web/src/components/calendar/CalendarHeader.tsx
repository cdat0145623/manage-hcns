import {
  addDays,
  addMonths,
  addWeeks,
  format,
  subDays,
  subMonths,
  subWeeks,
  startOfWeek,
  endOfWeek,
  isSameMonth,
} from "date-fns";
import { HiOutlineChevronLeft, HiOutlineChevronRight } from "react-icons/hi2";

export type ViewMode = "DAY" | "WEEK" | "MONTH";

interface CalendarHeaderProps {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export function CalendarHeader({
  currentDate,
  setCurrentDate,
  viewMode,
  setViewMode,
}: CalendarHeaderProps) {
  const onPrev = () => {
    if (viewMode === "MONTH") setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === "WEEK") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const onNext = () => {
    if (viewMode === "MONTH") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "WEEK") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const onToday = () => setCurrentDate(new Date());

  return (
    <div className="flex items-center justify-between border-b border-light-300 px-4 py-3 dark:border-dark-300">
      <div className="flex items-center space-x-4">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {viewMode === "MONTH" ? (
            format(currentDate, "MMMM yyyy")
          ) : viewMode === "WEEK" ? (
            <>
              {format(startOfWeek(currentDate), "MMM d")} —{" "}
              {format(
                endOfWeek(currentDate),
                isSameMonth(startOfWeek(currentDate), endOfWeek(currentDate))
                  ? "d, yyyy"
                  : "MMM d, yyyy"
              )}
            </>
          ) : (
            format(currentDate, "MMMM d, yyyy")
          )}
        </h2>
        <div className="flex items-center rounded-lg bg-light-200 p-1 dark:bg-dark-200">
          <button
            onClick={onPrev}
            className="rounded-md p-1 hover:bg-light-300 dark:hover:bg-dark-300"
          >
            <HiOutlineChevronLeft size={20} />
          </button>
          <button
            onClick={onToday}
            className="hover:text-primary-500 mx-2 px-2 text-sm font-medium"
          >
            Today
          </button>
          <button
            onClick={onNext}
            className="rounded-md p-1 hover:bg-light-300 dark:hover:bg-dark-300"
          >
            <HiOutlineChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="flex items-center rounded-lg bg-light-200 p-1 dark:bg-dark-200">
        {(["DAY", "WEEK", "MONTH"] as ViewMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
              viewMode === mode
                ? "text-primary-600 dark:text-primary-400 bg-white shadow-sm dark:bg-dark-400"
                : "text-light-600 hover:text-light-900 dark:text-dark-600 dark:hover:text-dark-900"
            }`}
          >
            {mode.charAt(0) + mode.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
