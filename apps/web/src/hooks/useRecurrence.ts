import {
  addMonths,
  endOfMonth,
  startOfMonth,
} from "date-fns";
import { useMemo } from "react";
import { api } from "~/utils/api";

export type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY" | "MONTHLY_DATE" | "MONTHLY_DAY" | "NONE" | "UNSELECTED";

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
  date: Date;
  status?: "pending" | "done" | "missed";
  type: "VIRTUAL" | "INSTANCE";
  color: string;
  duration: number;
}

export function useRecurrence(currentDate: Date) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(addMonths(currentDate, 1)); // Buffer

  // Lấy dữ liệu thực tế từ backend
  const { data: virtualTasks } = api.taskInstance.getVirtual.useQuery({
    from: monthStart,
    to: monthEnd,
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

      return {
        id: task.id,
        masterId: task.taskMasterId || task.masterId,
        instanceId: isVirtual ? undefined : task.id,
        // Dùng tạm fallback text "Công việc chưa có tên" nếu backend chưa return name
        title: task.name || task.taskMaster?.name || task.title || "Công việc (Chưa có tên)", 
        date: new Date(task.targetDate || task.date),
        status: currentStatus,
        type: isVirtual ? "VIRTUAL" : "INSTANCE",
        color: task.color ?? "bg-blue-500",
        duration: task.duration ?? 60,
      } as CalendarEntry;
    });
  }, [virtualTasks]);

  const createInstance = (masterId: string, date: Date) => {
    // Không dùng array local nữa vì UI sẽ tự động update qua API Invalidate
  };

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

  return { calendarEntries, createInstance, moveTask, masters: [] };
}
