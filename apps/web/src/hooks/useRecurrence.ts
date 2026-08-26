import { endOfMonth, startOfMonth } from "date-fns";
import { useMemo } from "react";

import { applyMasterWallTimeToAnchorDay } from "@kan/shared/utils";

import { api } from "~/utils/api";
import { getCalendarTaskDuration } from "~/utils/calendar";

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
  checklists: unknown[];
  createdBy?: string;
  penalty?: {
    priority: "high" | "medium" | "low";
    amountVnd: number;
    source: "system_default" | "global_policy" | "master_override";
    policyPublicId: string;
    snapshottedAt: Date | null;
    assessment: {
      publicId: string;
      amountVnd: number;
      currency: string;
      source: "system_default" | "global_policy" | "master_override";
      policyPublicId: string | null;
      assessedAt: Date;
      status: "active" | "voided";
    } | null;
  } | null;
}

export function useRecurrence(
  currentDate: Date,
  selectedUserId: string | undefined,
) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate); // Buffer

  // Lấy dữ liệu thực tế từ backend
  const { data: virtualTasks } = api.taskInstance.getVirtual.useQuery(
    {
      from: monthStart,
      to: monthEnd,
      targetUser: selectedUserId === "all" ? undefined : selectedUserId,
    },
    {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  );

  const utils = api.useUtils();
  const updateTask = api.taskInstance.update.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
    },
  });

  const calendarEntries = useMemo(() => {
    if (!virtualTasks) return [];

    return virtualTasks.map((task) => {
      const isVirtual = task.id.startsWith("virtual_");

      // Chuyển status về chữ thường để tránh lỗi khi hiển thị màu giao diện (bắt buộc phải là "pending" | "done" | "missed")
      let currentStatus = task.status.toLowerCase();
      if (!["pending", "done", "missed"].includes(currentStatus)) {
        currentStatus = "pending";
      }

      const targetDate = task.targetDate;
      const start = new Date(targetDate);
      const end = new Date(task.endDate ?? task.targetDate);

      const originalEnd = task.originalEndDate
        ? new Date(task.originalEndDate)
        : end;
      const duration =
        !isNaN(start.getTime()) && !isNaN(end.getTime())
          ? getCalendarTaskDuration(start, end, originalEnd)
          : 60;

      return {
        id: task.id,
        masterId: task.taskMasterId,
        instanceId: isVirtual ? undefined : task.id,
        title: task.name ?? task.taskMaster.name,
        description: task.description ?? task.taskMaster.description,
        assigneeName: task.assignee.name ?? "",
        selectedUserId: task.assignee.id,
        date: new Date(targetDate),
        startDate: new Date(targetDate),
        originalEndDate: originalEnd,
        endDate: end,
        status: currentStatus,
        type: isVirtual ? "VIRTUAL" : "INSTANCE",
        color: "bg-blue-500",
        duration: duration,
        recurrence: task.taskMaster.recurrence as RecurrenceType,
        rruleString: task.taskMaster.rruleString,
        rruleStringToText: task.taskMaster.rruleStringToText,
        checklists: task.checklists,
        createdBy: task.taskMaster.createdBy,
        penalty:
          task.penalty?.priority &&
          task.penalty.amountVnd !== null &&
          task.penalty.source &&
          task.penalty.policyPublicId
            ? {
                priority: task.penalty.priority,
                amountVnd: task.penalty.amountVnd,
                source: task.penalty.source,
                policyPublicId: task.penalty.policyPublicId,
                snapshottedAt: task.penalty.snapshottedAt,
                assessment: task.penalty.assessment,
              }
            : null,
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
  };
}
