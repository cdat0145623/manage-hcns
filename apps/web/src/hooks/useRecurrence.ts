import { useMemo } from "react";

import { applyMasterWallTimeToAnchorDay } from "@kan/shared/utils";

import { api } from "~/utils/api";
import {
  getAppCalendarMonthRange,
  getCalendarTaskDuration,
} from "~/utils/calendar";
import { inferCalendarRecurrenceType } from "~/utils/calendarEventSchedule";

export type RecurrenceType =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "MONTHLY_DATE"
  | "MONTHLY_DAY"
  | "NONE"
  | "UNSELECTED"
  | "CUSTOM";

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
  instanceId?: string;
  title: string;
  description: string;
  assigneeName: string;
  selectedUserId?: string;
  date: Date;
  startDate: Date;
  originalEndDate: Date;
  endDate: Date;
  status?: "pending" | "done" | "missed";
  color: string;
  duration: number;
  type: "VIRTUAL" | "INSTANCE";
  recurrence: RecurrenceType;
  rruleString: string;
  rruleStringToText?: string;
  checklists: any[];
  createdBy?: string;
  isCreating?: boolean;
}

export function useRecurrence(
  currentDate: Date,
  selectedUserId: string | undefined,
) {
  const { from: monthStart, to: monthEnd } =
    getAppCalendarMonthRange(currentDate);

  // Lấy dữ liệu thực tế từ backend
  const virtualTaskQuery = api.taskInstance.getVirtual.useQuery(
    {
      from: monthStart,
      to: monthEnd,
      targetUser: selectedUserId === "all" ? undefined : selectedUserId,
    },
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );
  const { data: virtualTasks } = virtualTaskQuery;

  const utils = api.useUtils();
  const updateTask = api.taskInstance.update.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
    },
  });

  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    if (!virtualTasks) return [];

    return virtualTasks.map((task: any) => {
      const isVirtual = task.id?.startsWith("virtual_");

      // Chuyển status về chữ thường để tránh lỗi khi hiển thị màu giao diện (bắt buộc phải là "pending" | "done" | "missed")
      let currentStatus =
        typeof task.status === "string" ? task.status.toLowerCase() : "pending";
      if (!["pending", "done", "missed"].includes(currentStatus)) {
        currentStatus = "pending";
      }

      const start = new Date(task.targetDate);
      const end = new Date(task.endDate);
      const originalEnd = task.originalEndDate
        ? new Date(task.originalEndDate)
        : end;

      const duration =
        start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
          ? getCalendarTaskDuration(start, end, originalEnd)
          : (task.duration ?? 60);

      return {
        id: task.id,
        masterId: task.taskMasterId || task.masterId,
        instanceId: isVirtual ? undefined : task.id,
        title: task.name || task.taskMaster?.name,
        description: task.description || task.taskMaster?.description,
        assigneeName: task.assignee?.name || "",
        selectedUserId: task.assignee?.id || "",
        date: new Date(task.targetDate),
        startDate: new Date(task.targetDate),
        originalEndDate: originalEnd,
        endDate: new Date(task.endDate),
        status: currentStatus,
        type: isVirtual ? "VIRTUAL" : "INSTANCE",
        color: task.color ?? "bg-blue-500",
        duration: duration,
        recurrence: inferCalendarRecurrenceType(
          task.taskMaster?.rruleString || task.rruleString || "",
        ),
        rruleString: task.taskMaster?.rruleString || task.rruleString || "",
        rruleStringToText: task.taskMaster?.rruleStringToText || "",
        checklists: task.checklists || [],
        createdBy: task.taskMaster.createdBy,
      } as CalendarEntry;
    });
  }, [virtualTasks]);

  const moveTask = (instanceId: string, newDayStart: Date) => {
    const entry = calendarEntries.find(
      (e: CalendarEntry) => e.id === instanceId,
    );
    if (!entry) return;

    const targetDate = applyMasterWallTimeToAnchorDay(
      newDayStart,
      entry.startDate,
    );

    updateTask.mutate({
      id: instanceId,
      taskMasterId: entry.masterId,
      targetDate,
      status: "pending",
    });
  };

  const data = api.card.getByUserId.useQuery(
    { userId: selectedUserId },
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );

  return {
    calendarEntries,
    cards: data.data?.filterCards,
    formattedResult: data.data?.formattedResult,
    moveTask,
    isInitialLoading:
      virtualTaskQuery.isLoading && virtualTaskQuery.data === undefined,
    isRefreshing:
      virtualTaskQuery.isFetching && virtualTaskQuery.data !== undefined,
    error: virtualTaskQuery.error,
    refetch: async () => {
      await Promise.all([virtualTaskQuery.refetch(), data.refetch()]);
    },
  };
}
