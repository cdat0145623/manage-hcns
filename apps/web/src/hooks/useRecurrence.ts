import {
  addMonths,
  endOfMonth,
  startOfMonth,
  differenceInMinutes,
} from "date-fns";
import { useMemo } from "react";
import { api } from "~/utils/api";

export type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY" | "MONTHLY_DATE" | "MONTHLY_DAY" | "NONE" | "UNSELECTED" | "CUSTOM";

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
  endDate: Date;
  status?: "pending" | "done" | "missed";
  color: string;
  duration: number;
  type: "VIRTUAL" | "INSTANCE";
  recurrence: RecurrenceType;
  rruleString: string;
  checklists: any[];
  createdBy?: string;
}

export function useRecurrence(currentDate: Date, selectedUserId: string | undefined) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate); // Buffer

  // Lấy dữ liệu thực tế từ backend
  const { data: virtualTasks } = api.taskInstance.getVirtual.useQuery({
    from: monthStart,
    to: monthEnd,
    targetUser: selectedUserId === "all" ? undefined : selectedUserId,
  });

  const utils = api.useUtils();
  const updateTask = api.taskInstance.update.useMutation({
    onSuccess: () => {
      void utils.taskInstance.getVirtual.invalidate();
    }
  });

  const calendarEntries = useMemo(() => {
    if (!virtualTasks) return [];

    return virtualTasks.map((task: any) => {
      const isVirtual = task.id?.startsWith("virtual_");

      // Chuyển status về chữ thường để tránh lỗi khi hiển thị màu giao diện (bắt buộc phải là "pending" | "done" | "missed")
      let currentStatus = typeof task.status === "string" ? task.status.toLowerCase() : "pending";
      if (!["pending", "done", "missed"].includes(currentStatus)) {
        currentStatus = "pending";
      }

      const start = new Date(task.taskMaster?.startDate);
      const end = new Date(task.taskMaster?.endDate);

      const duration =
        start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
          ? differenceInMinutes(end, start)
          : task.duration ?? 60;

      return {
        id: task.id,
        masterId: task.taskMasterId || task.masterId,
        instanceId: isVirtual ? undefined : task.id,
        title: task.name || task.taskMaster?.name,
        description: task.description || task.taskMaster?.description,
        assigneeName: task.assignee?.name || "",
        selectedUserId: task.assignee?.id || "",
        date: new Date(task.targetDate),
        startDate: new Date(task.taskMaster?.startDate),
        endDate: new Date(task.taskMaster?.endDate),
        status: currentStatus,
        type: isVirtual ? "VIRTUAL" : "INSTANCE",
        color: task.color ?? "bg-blue-500",
        duration: duration,
        recurrence: (task.taskMaster?.recurrence || task.recurrence || "NONE") as RecurrenceType,
        rruleString: task.taskMaster?.rruleString || task.rruleString || "",
        checklists: task.checklists || [],
        createdBy: task.taskMaster.createdBy,
      } as CalendarEntry;
    });
  }, [virtualTasks]);

  const moveTask = (instanceId: string, newDate: Date) => {
    const entry = calendarEntries.find((e: CalendarEntry) => e.id === instanceId);
    if (!entry) return;

    // Gửi yêu cầu đổi ngày (kéo thả) xuống DB
    updateTask.mutate({
      id: instanceId,
      taskMasterId: entry.masterId,
      targetDate: newDate,
      status: "pending",
    });
  };

  const data = api.card.getByUserId.useQuery({ userId: selectedUserId });

  return { calendarEntries, cards: data.data?.filterCards, formattedResult: data.data?.formattedResult , moveTask };
}
