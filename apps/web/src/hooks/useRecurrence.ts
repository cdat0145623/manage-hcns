import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
} from "date-fns";
import { useMemo, useState } from "react";

export type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY";

export interface TaskMaster {
  id: string;
  publicId: string;
  title: string;
  description: string;
  recurrence: RecurrenceType;
  color: string;
  duration?: number;
}

export interface TaskInstance {
  id: string;
  publicId: string;
  masterId: string;
  date: Date;
  status: "COMPLETED" | "PENDING";
}

export interface CalendarEntry {
  id: string;
  masterId: string;
  title: string;
  date: Date;
  type: "VIRTUAL" | "INSTANCE";
  color: string;
  duration: number;
}

const MOCK_MASTERS: TaskMaster[] = [];

export function useRecurrence(currentDate: Date) {
  const [instances, setInstances] = useState<TaskInstance[]>([]);

  const calendarEntries = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(addMonths(currentDate, 1)); // Buffer
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    const entries: CalendarEntry[] = [];

    days.forEach((day) => {
      MOCK_MASTERS.forEach((master) => {
        let shouldShow = false;

        if (master.recurrence === "DAILY") {
          shouldShow = true;
        } else if (master.recurrence === "WEEKLY") {
          shouldShow = day.getDay() === 1;
        } else {
          shouldShow = day.getDate() === 1;
        }

        if (shouldShow) {
          const entryDate = new Date(day);
          if (master.title === "Daily Standup") entryDate.setHours(9, 0, 0, 0);
          else if (master.title === "Weekly Review")
            entryDate.setHours(14, 0, 0, 0);
          else if (master.title === "Monthly Planning")
            entryDate.setHours(10, 0, 0, 0);

          const instance = instances.find(
            (inst) =>
              inst.masterId === master.id &&
              isSameDay(new Date(inst.date), day),
          );

          if (instance) {
            entries.push({
              id: instance.id,
              masterId: master.id,
              title: master.title,
              date: entryDate,
              type: "INSTANCE",
              color: master.color,
              duration: master.duration ?? 60,
            });
          } else {
            entries.push({
              id: `v_${master.id}_${format(day, "yyyy-MM-dd")}`,
              masterId: master.id,
              title: master.title,
              date: entryDate,
              type: "VIRTUAL",
              color: master.color,
              duration: master.duration ?? 60,
            });
          }
        }
      });
    });

    return entries;
  }, [currentDate, instances]);

  const createInstance = (masterId: string, date: Date) => {
    const newInstance: TaskInstance = {
      id: `inst_${Math.random().toString(36).substr(2, 9)}`,
      publicId: `ti_${Math.random().toString(36).substr(2, 9)}`,
      masterId,
      date,
      status: "PENDING",
    };
    setInstances((prev) => [...prev, newInstance]);
  };

  const moveTask = (instanceId: string, newDate: Date) => {
    setInstances((prev) =>
      prev.map((inst) =>
        inst.id === instanceId ? { ...inst, date: newDate } : inst,
      ),
    );
  };

  return { calendarEntries, createInstance, moveTask, masters: MOCK_MASTERS };
}
