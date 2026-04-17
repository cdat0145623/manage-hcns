import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { addDays, addMonths, addWeeks, format, subDays, subMonths, subWeeks, startOfWeek, endOfWeek } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Fragment, useMemo } from "react";
import { HiOutlineChevronLeft, HiOutlineChevronRight, HiOutlineUserCircle, HiChevronUpDown, HiCheck } from "react-icons/hi2";

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
}

export function CalendarHeader({
  currentDate,
  setCurrentDate,
  viewMode,
  setViewMode,
  selectedUserId,
  setSelectedUserId,
  users,
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
    <div className="flex items-center justify-between border-b border-light-300 p-2 dark:border-dark-300">
      <div className="flex items-center space-x-4 pl-2">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {viewMode === "MONTH" ? (
            `Tháng ${currentDate.getMonth() + 1} ${currentDate.getFullYear()}`
          ) : viewMode === "WEEK" ? (
            <>
              {format(startOfWeek(currentDate, { weekStartsOn: 1 }), "d")} Tháng {startOfWeek(currentDate, { weekStartsOn: 1 }).getMonth() + 1} — 
              {format(endOfWeek(currentDate, { weekStartsOn: 1 }), "d")} Tháng {endOfWeek(currentDate, { weekStartsOn: 1 }).getMonth() + 1}, {format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy")}
            </>
          ) : (
            `${currentDate.getDate()} Tháng ${currentDate.getMonth() + 1}, ${format(currentDate, "yyyy")}`
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

      <div className="flex items-center gap-1">
        <div className="relative w-[200px]">
          <Listbox value={selectedUserId} onChange={setSelectedUserId}>
            <div className="relative">
              {/* <Listbox value={selectedUserId} onChange={setSelectedUserId}> */}
              <ListboxButton className="relative w-full cursor-pointer rounded-xl border border-neutral-200/70 bg-white/50 py-2.5 pl-4 pr-10 text-left text-sm font-semibold text-neutral-900 shadow-sm transition-all hover:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-dark-400/50 dark:bg-dark-300/50 dark:text-white dark:hover:bg-dark-200">
                <span className="flex items-center gap-2.5 truncate">
                  <HiOutlineUserCircle className="h-5 w-5 shrink-0 text-neutral-400 dark:text-neutral-500" />
                  <span className="block truncate">
                    {users?.find((u) => u.id === selectedUserId)?.name || "Chọn người dùng"}
                  </span>
                </span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <HiChevronUpDown className="h-5 w-5 text-neutral-400" aria-hidden="true" />
                </span>
              </ListboxButton>

              <Transition
                as={Fragment}
                leave="transition ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
              >
                <ListboxOptions className="absolute z-50 mt-1.5 max-h-60 w-full overflow-auto rounded-xl bg-white/90 py-1.5 text-base shadow-xl ring-1 ring-black/5 backdrop-blur-md focus:outline-none dark:bg-dark-50/90 dark:ring-white/10 sm:text-sm">
                  {users?.map((user) => (
                    <ListboxOption
                      key={user.id}
                      value={user.id}
                      className={({ focus, selected }) =>
                        `relative cursor-pointer select-none py-2.5 pl-10 pr-4 transition-colors ${
                          focus ? "bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100" : "text-neutral-900 dark:text-neutral-200"
                        } ${selected ? "font-bold" : "font-medium"}`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className={`block truncate ${selected ? "text-blue-600 dark:text-blue-400" : ""}`}>
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
        <div className="flex items-center gap-1 rounded-full bg-neutral-100/80 p-1 dark:bg-neutral-800/80 shadow-inner">
          {(["DAY", "WEEK", "MONTH"] as ViewMode[]).map((mode) => {
            const modeLabel: Record<ViewMode, string> = { DAY: "Ngày", WEEK: "Tuần", MONTH: "Tháng" };
            return (
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
              {modeLabel[mode]}
            </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
