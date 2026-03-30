/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import { format, getDate, getDay } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { authClient } from "@kan/auth/client";
import { generateRRuleString } from "@kan/shared/utils";

import { api } from "~/utils/api";
import Modal from "../modal";

export type RecurrenceType =
  | "UNSELECTED"
  | "NONE"
  | "WEEKLY"
  | "MONTHLY_DATE"
  | "MONTHLY_DAY";

export interface Attendee {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
}

export interface EditableEntry {
  id: string;
  title: string;
  description?: string;
  date: Date | string;
  endDate?: Date | string;
  startTime?: string;
  endTime?: string;
  color?: string;
  recurrence?: RecurrenceType;
  attendees?: Attendee[];
}

export interface CreateEventInput {
  title: string;
  description: string;
  startDate: Date;
  endDate: Date;
  startTime: string;
  endTime: string;
  recurrence: string;
  attendees: Attendee[];
}

interface CreateEventModalProps {
  isVisible: boolean;
  onClose: () => void;
  onSave: (event: CreateEventInput) => void;
  onUpdate?: (id: string, event: CreateEventInput) => void;
  selectedDate: Date;
  editEntry?: EditableEntry | null;
}

const parseTime = (t: string) => {
  const [h, m] = t.split(":").map((n) => parseInt(n ?? "0", 10));
  return { hours: h ?? 0, minutes: m ?? 0 };
};

const timeToMinutes = (t: string) => {
  const { hours, minutes } = parseTime(t);
  return hours * 60 + minutes;
};

const minutesToTime = (mins: number) => {
  const clamped = Math.min(mins, 24 * 60 - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const NTH_LABELS = ["first", "second", "third", "fourth", "fifth"];

function ordinalSuffix(n: number) {
  if (n >= 11 && n <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

function getNthWeekdayLabel(date: Date) {
  const nth = Math.ceil(getDate(date) / 7);
  return `${NTH_LABELS[nth - 1] ?? "last"} ${DAY_NAMES[getDay(date)] ?? ""}`;
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-purple-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-amber-500",
];

function avatarColor(id: string) {
  return (
    AVATAR_COLORS[id.charCodeAt(id.length - 1) % AVATAR_COLORS.length] ??
    "bg-blue-500"
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black uppercase tracking-[0.15em] text-neutral-500 dark:text-neutral-400">
      {children}
    </p>
  );
}

export function CreateEventModal({
  isVisible,
  onClose,
  onSave,
  onUpdate,
  selectedDate,
  editEntry,
}: CreateEventModalProps) {
  const isEditMode = !!editEntry;
  const { data: session } = authClient.useSession();

  // const utils = api.useUtils();
  // const createTask = api.taskMaster.create.useMutation({
  //   onSuccess: () => {
  //     // Refresh the queries
  //     void utils.taskMaster.invalidate();
  //     onClose();
  //   },
  //   onError: (err: { message?: string }) => {
  //     alert(`Failed to save event: ${err.message ?? "Unknown error"}`);
  //   },
  // });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currentDate, setCurrentDate] = useState<Date>(selectedDate);
  const [endDateVal, setEndDateVal] = useState<Date>(selectedDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [recurrence, setRecurrence] = useState<RecurrenceType>("UNSELECTED");
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);

  const [attendeeIdInput, setAttendeeIdInput] = useState("");

  const [showStartOptions, setShowStartOptions] = useState(false);
  const [showEndOptions, setShowEndOptions] = useState(false);
  const startTimeRef = useRef<HTMLDivElement>(null);
  const endTimeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        startTimeRef.current &&
        !startTimeRef.current.contains(e.target as Node)
      ) {
        setShowStartOptions(false);
      }
      if (
        endTimeRef.current &&
        !endTimeRef.current.contains(e.target as Node)
      ) {
        setShowEndOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const startTimeOptions = useMemo(() => {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    let nextRounded = Math.ceil(currentMins / 30) * 30;
    if (nextRounded >= 24 * 60) nextRounded = 23 * 60 + 30;

    const options = [];
    for (let i = nextRounded; i < 24 * 60; i += 30) {
      const val = minutesToTime(i);
      options.push({ value: val, label: val });
    }
    return options;
  }, []);

  const endTimeOptionsList = useMemo(() => {
    const startMins = timeToMinutes(startTime);
    const options = [];

    let nextStart = startMins + 30;
    if (nextStart >= 24 * 60) nextStart = 23 * 60 + 30;

    for (let i = nextStart; i < 24 * 60; i += 30) {
      const val = minutesToTime(i);
      const diff = i - startMins;
      const hrs = Math.floor(diff / 60);
      const mns = diff % 60;
      let diffStr = "";
      if (hrs > 0) diffStr += `${hrs}h`;
      if (mns > 0) diffStr += `${diffStr ? " " : ""}${mns}m`;

      const label = `${val} (+${diffStr})`;
      options.push({ value: val, label });
    }
    return options;
  }, [startTime]);

  useEffect(() => {
    if (!isVisible) return;
    if (editEntry) {
      setTitle(editEntry.title);
      setDescription(editEntry.description ?? "");
      setCurrentDate(new Date(editEntry.date));
      setEndDateVal(
        editEntry.endDate
          ? new Date(editEntry.endDate)
          : new Date(editEntry.date),
      );
      setStartTime(editEntry.startTime ?? "09:00");
      setEndTime(editEntry.endTime ?? "10:00");
      setRecurrence(editEntry.recurrence ?? "NONE");
      setAttendees(editEntry.attendees ?? []);
    } else {
      setTitle("");
      setDescription("");
      setCurrentDate(selectedDate);
      setEndDateVal(selectedDate);

      // Default to next rounded 30 minutes
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      let nextRounded = Math.ceil(currentMins / 30) * 30;
      if (nextRounded >= 24 * 60) nextRounded = 23 * 60 + 30;

      setStartTime(minutesToTime(nextRounded));
      setEndTime(minutesToTime(Math.min(24 * 60 - 1, nextRounded + 60)));
      setRecurrence("UNSELECTED");
      setAttendees([]);
      setHasAttemptedSave(false);
    }
    setAttendeeIdInput("");
  }, [isVisible, editEntry, selectedDate]);

  const recurrenceOptions = useMemo(() => {
    const dayName = DAY_NAMES[getDay(currentDate)] ?? "";
    const dateNum = getDate(currentDate);
    const nthLabel = getNthWeekdayLabel(currentDate);
    return [
      { value: "NONE" as RecurrenceType, label: "Does not repeat", icon: "🚫" },
      {
        value: "WEEKLY" as RecurrenceType,
        label: `Weekly on ${dayName}`,
        icon: "🗓️",
      },
      {
        value: "MONTHLY_DATE" as RecurrenceType,
        label: `Monthly on the ${dateNum}${ordinalSuffix(dateNum)}`,
        icon: "📆",
      },
      {
        value: "MONTHLY_DAY" as RecurrenceType,
        label: `Monthly on the ${nthLabel}`,
        icon: "🔄",
      },
    ];
  }, [currentDate]);

  const selectedOpt = recurrenceOptions.find((o) => o.value === recurrence);

  const isEndNextDay = useMemo(() => {
    return timeToMinutes(endTime) < timeToMinutes(startTime);
  }, [startTime, endTime]);

  const showEndDate = true;

  // Sync end date if it falls behind start date or if we revert to single day
  useEffect(() => {
    const start = new Date(currentDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateVal);
    end.setHours(0, 0, 0, 0);

    if (isEndNextDay) {
      if (end <= start) {
        const nextDay = new Date(start);
        nextDay.setDate(nextDay.getDate() + 1);
        setEndDateVal(nextDay);
      }
    } else {
      // If not spanning next day by time, and they want it hidden, we force it back to same day
      if (end.getTime() !== start.getTime()) {
        setEndDateVal(start);
      }
    }
  }, [currentDate, endDateVal, isEndNextDay]);

  const handleAddGuestById = () => {
    const id = attendeeIdInput.trim();
    if (!id) return;

    const newGuest: Attendee = {
      id,
      name: `User ${id}`,
      email: `${id}@employee.com`,
    };

    setAttendees((prev) => {
      if (prev.find((a) => a.id === id)) return prev;
      return [...prev, newGuest];
    });
    setAttendeeIdInput("");
  };

  const removeAttendee = (id: string) =>
    setAttendees((prev) => prev.filter((a) => a.id !== id));

  const handleSave = () => {
    setHasAttemptedSave(true);
    if (!title.trim()) return alert("Please enter a title");
    if (recurrence === "UNSELECTED") {
      return alert("Vui lòng chọn tùy chọn lặp lại (Repeat).");
    }

    // Setup precise dates
    const startDT = new Date(currentDate);
    const { hours: sh, minutes: sm } = parseTime(startTime);
    startDT.setHours(sh, sm, 0);

    const endDT = new Date(endDateVal);
    const { hours: eh, minutes: em } = parseTime(endTime);
    endDT.setHours(eh, em, 0);

    // Call external/previous handler just in case
    const payload: CreateEventInput = {
      title,
      description,
      startDate: startDT,
      endDate: endDT,
      startTime,
      endTime,
      recurrence,
      attendees,
    };
    if (isEditMode && onUpdate && editEntry) {
      onUpdate(editEntry.id, payload);
    } else {
      onSave(payload);
    }

    // Connect to Backend API
    let rruleString = "";
    if (recurrence !== "NONE") {
      try {
        rruleString = generateRRuleString({
          type:
            recurrence === "WEEKLY"
              ? "dayOfWeek"
              : recurrence === "MONTHLY_DATE"
                ? "monthlyDate"
                : "monthlyDayRank",
          days: recurrence === "WEEKLY" ? [startDT.getDay()] : undefined,
          dates:
            recurrence === "MONTHLY_DATE" ? [startDT.getDate()] : undefined,
          rankDay: recurrence === "MONTHLY_DAY" ? startDT.getDay() : undefined,
          rank:
            recurrence === "MONTHLY_DAY"
              ? Math.ceil(startDT.getDate() / 7)
              : undefined,
          startTime,
          startDate: startDT,
        });
      } catch (e) {
        console.error("Failed to parse recurrence:", e);
      }
    }

    const currentUserId = session?.user?.id;
    if (!currentUserId) {
      alert("You must be logged in to save events");
      return;
    }

    createTask.mutate({
      name: title,
      description,
      startDate: startDT,
      endDate: endDT,
      selectedUserId: attendees.length > 0 ? attendees[0]?.id! : currentUserId,
      rruleString,
      createdBy: currentUserId,
    });
  };
  return (
    <Modal isVisible={isVisible} centered modalSize={showEndDate ? "lg" : "md"}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="relative flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-dark-100"
      >
        <div
          className={`flex-shrink-0 border-b border-light-200 px-7 py-5 dark:border-dark-300 ${
            isEditMode
              ? "bg-gradient-to-r from-violet-50 to-purple-50 dark:from-dark-200 dark:to-dark-300"
              : "bg-gradient-to-r from-blue-50 to-sky-50 dark:from-dark-200 dark:to-dark-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">{isEditMode ? "✏️" : "✨"}</span>
              <div>
                <h2 className="text-lg font-black tracking-tight text-neutral-900 dark:text-white">
                  {isEditMode ? "Edit" : "New"}
                </h2>
                {isEditMode && editEntry && (
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    Editing &ldquo;{editEntry.title}&rdquo;
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-white/80 hover:text-neutral-700 dark:hover:bg-dark-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
          <div className="space-y-1.5">
            <Label>Event Title *</Label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add title"
              autoFocus
              className="w-full rounded-xl border border-neutral-200/70 bg-neutral-50/50 px-4 py-3 text-base font-semibold text-neutral-900 placeholder-neutral-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all hover:bg-neutral-50 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 dark:border-dark-400/50 dark:bg-dark-300/50 dark:text-white dark:focus:bg-dark-200"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description (optional)"
              rows={2}
              className="w-full resize-none rounded-xl border border-neutral-200/70 bg-neutral-50/50 px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all hover:bg-neutral-50 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 dark:border-dark-400/50 dark:bg-dark-300/50 dark:text-white dark:focus:bg-dark-200"
            />
          </div>

          <motion.div
            layout
            className="space-y-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:border-dark-300 dark:bg-dark-200/50"
          >
            <div className="flex flex-wrap items-center gap-3">
              {/* Date */}
              <div className="relative">
                <input
                  type="date"
                  value={format(currentDate, "yyyy-MM-dd")}
                  onChange={(e) => {
                    const d = new Date(e.target.value);
                    if (!isNaN(d.getTime())) setCurrentDate(d);
                  }}
                  className="cursor-pointer appearance-none rounded-lg border-none bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 shadow-none transition-colors hover:bg-neutral-200 focus:bg-blue-50 focus:text-blue-700 focus:outline-none focus:ring-0 dark:bg-dark-300 dark:text-neutral-200 dark:hover:bg-dark-400 dark:focus:bg-blue-900/30 dark:focus:text-blue-300"
                />
              </div>

              {/* Start time */}
              <div className="relative" ref={startTimeRef}>
                <input
                  type="text"
                  placeholder="HH:mm"
                  maxLength={5}
                  value={startTime}
                  onFocus={(e) => {
                    e.target.select();
                    setShowStartOptions(true);
                  }}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (
                      val.length === 2 &&
                      startTime.length === 1 &&
                      !val.includes(":")
                    ) {
                      val += ":";
                    }
                    setStartTime(val);
                    if (val.length === 5 && val.includes(":")) {
                      setEndTime(minutesToTime(timeToMinutes(val) + 60));
                    }
                  }}
                  onBlur={() => {
                    if (
                      startTime &&
                      !startTime.includes(":") &&
                      startTime.length <= 2
                    ) {
                      setStartTime(startTime.padStart(2, "0") + ":00");
                    }
                  }}
                  className="w-[84px] cursor-text appearance-none rounded-lg border-none bg-neutral-100 px-3 py-2 text-center text-sm font-medium text-neutral-700 shadow-none transition-colors hover:bg-neutral-200 focus:bg-neutral-200 focus:outline-none focus:ring-0 dark:bg-dark-300 dark:text-neutral-200 dark:hover:bg-dark-400 dark:focus:bg-dark-400"
                />

                <AnimatePresence>
                  {showStartOptions && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.1 }}
                      className="absolute left-0 top-full z-50 mt-1.5 max-h-60 w-36 overflow-hidden overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-dark-300 dark:bg-dark-100"
                    >
                      {startTimeOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setStartTime(opt.value);
                            setEndTime(
                              minutesToTime(timeToMinutes(opt.value) + 60),
                            );
                            setShowStartOptions(false);
                          }}
                          className="flex w-full items-center px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-300"
                        >
                          {opt.label.replace("Now", "Hiện tại")}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <span className="text-sm font-medium text-neutral-400">-</span>

              {/* End time */}
              <div className="relative" ref={endTimeRef}>
                <input
                  type="text"
                  placeholder="HH:mm"
                  maxLength={5}
                  value={endTime}
                  onFocus={(e) => {
                    e.target.select();
                    setShowEndOptions(true);
                  }}
                  onChange={(e) => {
                    let val = e.target.value;
                    if (
                      val.length === 2 &&
                      endTime.length === 1 &&
                      !val.includes(":")
                    ) {
                      val += ":";
                    }
                    setEndTime(val);
                  }}
                  onBlur={() => {
                    if (
                      endTime &&
                      !endTime.includes(":") &&
                      endTime.length <= 2
                    ) {
                      setEndTime(endTime.padStart(2, "0") + ":00");
                    }
                  }}
                  className="w-[84px] cursor-text appearance-none rounded-lg border-none bg-neutral-100 px-3 py-2 text-center text-sm font-medium text-neutral-700 shadow-none transition-colors hover:bg-neutral-200 focus:bg-neutral-200 focus:outline-none focus:ring-0 dark:bg-dark-300 dark:text-neutral-200 dark:hover:bg-dark-400 dark:focus:bg-dark-400"
                />

                <AnimatePresence>
                  {showEndOptions && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.1 }}
                      className="absolute left-0 top-full z-50 mt-1.5 max-h-60 w-48 overflow-hidden overflow-y-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-dark-300 dark:bg-dark-100"
                    >
                      {endTimeOptionsList.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => {
                            setEndTime(opt.value);
                            setShowEndOptions(false);
                          }}
                          className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-dark-300"
                        >
                          <span>{opt.value}</span>
                          <span className="text-xs text-neutral-400">
                            {opt.label
                              .replace(opt.value, "")
                              .replace("(", "")
                              .replace(")", "")
                              .trim()}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence>
                {showEndDate && (
                  <motion.div className="relative overflow-hidden">
                    <input
                      type="date"
                      value={format(endDateVal, "yyyy-MM-dd")}
                      min={format(currentDate, "yyyy-MM-dd")}
                      onChange={(e) => {
                        const d = new Date(e.target.value);
                        if (!isNaN(d.getTime())) setEndDateVal(d);
                      }}
                      className="w-[125px] cursor-pointer appearance-none rounded-lg border-none bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 shadow-none transition-colors hover:bg-neutral-200 focus:bg-blue-50 focus:text-blue-700 focus:outline-none focus:ring-0 dark:bg-dark-300 dark:text-neutral-200 dark:hover:bg-dark-400 dark:focus:bg-blue-900/30 dark:focus:text-blue-300"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="space-y-2">
              <Label>Repeat</Label>
              <div className="relative">
                <select
                  value={recurrence}
                  onChange={(e) =>
                    setRecurrence(e.target.value as RecurrenceType)
                  }
                  className={`w-full appearance-none rounded-xl border bg-none py-3 pl-4 pr-9 text-sm font-medium shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 dark:focus:bg-dark-200 ${hasAttemptedSave && recurrence === "UNSELECTED" ? "border-rose-400 bg-rose-50/50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400" : "border-neutral-200/70 bg-neutral-50/50 text-neutral-900 dark:border-dark-400/50 dark:bg-dark-300/50 dark:text-white"}`}
                  style={{ backgroundImage: "none" }}
                >
                  <option value="UNSELECTED" disabled hidden>
                    Select repeating option...
                  </option>
                  {recurrenceOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                  <svg
                    className="h-4 w-4 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>
              </div>

              <AnimatePresence>
                {recurrence !== "NONE" && selectedOpt && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 dark:bg-blue-900/30"
                  >
                    <span className="text-sm">{selectedOpt.icon}</span>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      {selectedOpt.label}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          <div className="space-y-2.5">
            <Label>Add Guests</Label>

            <div className="flex items-center gap-2">
              <div className="relative flex flex-1 items-center gap-2.5 overflow-hidden rounded-xl border border-neutral-200/70 bg-neutral-50/50 px-4 py-3 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:ring-[3px] focus-within:ring-blue-500/10 hover:bg-neutral-50 dark:border-dark-400/50 dark:bg-dark-300/50 dark:focus-within:bg-dark-200">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-neutral-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <input
                  type="text"
                  value={attendeeIdInput}
                  onChange={(e) => setAttendeeIdInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddGuestById();
                    }
                  }}
                  placeholder="Enter User ID to add..."
                  className="flex-1 appearance-none border-none bg-transparent p-0 text-sm text-neutral-900 placeholder-neutral-400 shadow-none focus:outline-none focus:ring-0 dark:text-white dark:placeholder-dark-500"
                />
              </div>
              <button
                onClick={handleAddGuestById}
                className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-600 transition-all hover:bg-blue-100 active:scale-95 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40"
              >
                Add
              </button>
            </div>

            <AnimatePresence>
              {attendees.length > 0 && (
                <motion.div
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="overflow-hidden rounded-xl border border-light-200 dark:border-dark-300"
                >
                  {attendees.map((att, idx) => (
                    <motion.div
                      key={att.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      className={`flex items-center gap-3 px-4 py-2.5 ${
                        idx !== attendees.length - 1
                          ? "border-b border-light-200 dark:border-dark-300"
                          : ""
                      } bg-white dark:bg-dark-200`}
                    >
                      <div
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(att.id)}`}
                      >
                        {getInitials(att.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-neutral-800 dark:text-white">
                          {att.name}
                        </p>
                        <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">
                          {att.email}
                          {att.role ? ` · ${att.role}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => removeAttendee(att.id)}
                        className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-neutral-300 transition-colors hover:bg-rose-100 hover:text-rose-500 dark:hover:bg-rose-900/30"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="rounded-xl bg-neutral-50 p-4 dark:bg-dark-200">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.15em] text-neutral-400">
              Summary
            </p>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              {title || (
                <span className="font-normal italic text-neutral-400">
                  Untitled Event
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {format(currentDate, "MMM d, yyyy")}{" "}
              {currentDate.getTime() !== endDateVal.getTime() &&
                `– ${format(endDateVal, "MMM d, yyyy")}`}{" "}
              · {startTime} – {endTime}
            </p>
            {recurrence !== "NONE" && selectedOpt && (
              <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                {selectedOpt.icon} {selectedOpt.label}
              </p>
            )}
            {attendees.length > 0 && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex -space-x-1.5">
                  {attendees.slice(0, 5).map((a) => (
                    <div
                      key={a.id}
                      title={a.name}
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-white dark:ring-dark-200 ${avatarColor(a.id)}`}
                    >
                      {getInitials(a.name)}
                    </div>
                  ))}
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {attendees.length} guest{attendees.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-shrink-0 gap-3 border-t border-light-200 bg-light-50 px-7 py-4 dark:border-dark-300 dark:bg-dark-200">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-neutral-100 px-6 py-3 text-sm font-bold text-neutral-600 transition-all hover:bg-neutral-200 dark:bg-dark-300 dark:text-dark-200 dark:hover:bg-dark-400"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`flex-1 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-[0.98] ${
              isEditMode
                ? "bg-violet-500 hover:bg-violet-600"
                : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {isEditMode ? "Update" : "Save"}
          </button>
        </div>
      </motion.div>
    </Modal>
  );
}
