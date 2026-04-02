import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { motion } from "framer-motion";
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
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-100/80 p-1 dark:bg-neutral-800/80 shadow-inner">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onPrev}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-white hover:text-blue-600 hover:shadow-sm dark:hover:bg-neutral-700"
          >
            <HiOutlineChevronLeft size={18} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onToday}
            className="px-4 py-1 text-sm font-black uppercase tracking-tighter text-neutral-700 transition-all hover:text-blue-600 dark:text-neutral-300 dark:hover:text-white"
          >
            Today
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onNext}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-all hover:bg-white hover:text-blue-600 hover:shadow-sm dark:hover:bg-neutral-700"
          >
            <HiOutlineChevronRight size={18} />
          </motion.button>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-full bg-neutral-100/80 p-1 dark:bg-neutral-800/80 shadow-inner">
        {(["DAY", "WEEK", "MONTH"] as ViewMode[]).map((mode) => (
          <motion.button
            key={mode}
            whileHover={viewMode !== mode ? { scale: 1.05, backgroundColor: "rgba(255,255,255,0.8)" } : {}}
            whileTap={{ scale: 0.95 }}
            onClick={() => setViewMode(mode)}
            className={`rounded-full px-5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
              viewMode === mode
                ? "bg-white text-blue-600 shadow-md dark:bg-neutral-700 dark:text-white"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {mode}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
