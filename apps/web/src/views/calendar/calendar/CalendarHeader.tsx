import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { t } from "@lingui/macro";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { Fragment, useMemo } from "react";
import {
  HiCheck,
  HiChevronUpDown,
  HiOutlineArrowPath,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineQueueList,
  HiOutlineUserCircle,
} from "react-icons/hi2";

export type ViewMode = "DAY" | "WEEK" | "MONTH";

interface User {
  name: string | null;
  id: string;
  email: string | null;
  username: string | null;
}

interface CalendarHeaderProps {
  currentDate: Date;
  setCurrentDate: (date: Date) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedUserId: string | undefined;
  setSelectedUserId: (id: string | undefined) => void;
  users: User[] | undefined;
  isAdmin: boolean;
  onManageRecurringTasks: () => void;
}

export function CalendarHeader({
  currentDate,
  setCurrentDate,
  viewMode,
  setViewMode,
  selectedUserId,
  setSelectedUserId,
  users,
  isAdmin,
  onManageRecurringTasks,
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 border-b border-light-300 p-2 dark:border-dark-300">
      <div className="flex items-center space-x-4 pl-2">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {viewMode === "MONTH" ? (
            `Tháng ${currentDate.getMonth() + 1} ${currentDate.getFullYear()}`
          ) : viewMode === "WEEK" ? (
            <>
              {format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d")} Tháng{" "}
              {startOfWeek(currentDate, { weekStartsOn: 1 }).getMonth() + 1} —
              {format(endOfWeek(currentDate, { weekStartsOn: 1 }), "d")} Tháng{" "}
              {endOfWeek(currentDate, { weekStartsOn: 1 }).getMonth() + 1},{" "}
              {format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy")}
            </>
          ) : (
            `${currentDate.getDate()} Tháng ${currentDate.getMonth() + 1}, ${format(currentDate, "yyyy")}`
          )}
        </h2>
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-100/80 p-1 shadow-inner dark:bg-neutral-800/80">
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
            Hôm nay
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

      {isAdmin ? (
        <button
          type="button"
          onClick={onManageRecurringTasks}
          className="flex h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
        >
          <HiOutlineQueueList className="h-4 w-4" />
          <span className="hidden sm:inline">{t`Công việc lặp lại`}</span>
        </button>
      ) : (
        <span />
      )}

      <div className="flex items-center justify-end gap-1">
        <div className="relative w-[200px]">
          <Listbox value={selectedUserId} onChange={setSelectedUserId}>
            <div className="relative">
              {/* <Listbox value={selectedUserId} onChange={setSelectedUserId}> */}
              <ListboxButton className="relative w-full cursor-pointer rounded-xl border border-neutral-200 bg-white py-2.5 pl-4 pr-10 text-left text-sm font-semibold text-neutral-900 shadow-sm transition-all hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-dark-400 dark:bg-dark-200 dark:text-white dark:hover:bg-dark-300">
                <span className="flex items-center gap-2.5 truncate">
                  <HiOutlineUserCircle className="h-5 w-5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                  <span className="block truncate">
                    {users?.find((u) => u.id === selectedUserId)?.name ||
                      "Chọn người dùng"}
                  </span>
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <HiChevronUpDown
                    className="h-5 w-5 text-neutral-400"
                    aria-hidden="true"
                  />
                </span>
              </ListboxButton>

              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <ListboxOptions className="absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-xl bg-white py-1.5 text-base shadow-xl ring-1 ring-black/5 focus:outline-none dark:bg-dark-50 dark:ring-white/10 sm:text-sm">
                  {users?.map((user) => (
                    <ListboxOption
                      key={user.id}
                      value={user.id}
                      className={({ focus, selected }) =>
                        `relative cursor-pointer select-none py-2.5 pl-10 pr-4 transition-colors ${
                          focus
                            ? "bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                            : "text-neutral-900 dark:text-neutral-200"
                        } ${selected ? "font-bold" : "font-medium"}`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span
                            className={`block truncate ${selected ? "text-blue-600 dark:text-blue-400" : ""}`}
                          >
                            {user.name || user.username || user.email}
                          </span>
                          {selected ? (
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-600 dark:text-blue-400">
                              <HiCheck className="h-5 w-5" aria-hidden="true" />
                            </span>
                          ) : null}
                        </>
                      )}
                    </ListboxOption>
                  ))}
                </ListboxOptions>
              </Transition>
            </div>
          </Listbox>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-neutral-100/80 p-1 shadow-inner dark:bg-neutral-800/80">
          {(["DAY", "WEEK", "MONTH"] as ViewMode[]).map((mode) => {
            const modeLabel: Record<ViewMode, string> = {
              DAY: "Ngày",
              WEEK: "Tuần",
              MONTH: "Tháng",
            };
            return (
              <motion.button
                key={mode}
                whileHover={
                  viewMode !== mode
                    ? { scale: 1.05, backgroundColor: "rgba(255,255,255,0.8)" }
                    : {}
                }
                whileTap={{ scale: 0.95 }}
                onClick={() => setViewMode(mode)}
                className={`rounded-full px-5 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                  viewMode === mode
                    ? "bg-white text-blue-600 shadow-md dark:bg-neutral-700 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                {modeLabel[mode]}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
