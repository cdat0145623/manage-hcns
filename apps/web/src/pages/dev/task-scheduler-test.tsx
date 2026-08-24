import { useMemo, useState } from "react";

import type { NextPageWithLayout } from "~/pages/_app";
import { getDashboardLayout } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";
import { api } from "~/utils/api";

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDefaultEndDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return toDateInputValue(date);
};

const TaskSchedulerTestPage: NextPageWithLayout = () => {
  const today = useMemo(() => toDateInputValue(new Date()), []);
  const usersQuery = api.user.getAll.useQuery();
  const utils = api.useUtils();
  const seedMutation = api.cron.seedLocalDailyTasks.useMutation();
  const runMutation = api.cron.runLocalScheduler.useMutation();
  const runMissedMutation =
    api.cron.runLocalMissedStatusScheduler.useMutation();
  const cleanupMutation = api.cron.cleanupLocalDailyTasks.useMutation();

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [count, setCount] = useState(20);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:30");
  const [runDate, setRunDate] = useState(today);
  const [lastBatchId, setLastBatchId] = useState("");
  const [message, setMessage] = useState("");

  const toggleUser = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const seed = async () => {
    setMessage("");
    const batchId = `local-${Date.now()}`;

    try {
      const result = await seedMutation.mutateAsync({
        count,
        userIds: selectedUserIds,
        startDate,
        endDate,
        startTime,
        endTime,
        batchId,
      });
      setLastBatchId(result.batchId);
      setMessage(
        `Đã tạo ${result.created} task master. Batch: ${result.batchId}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Seed thất bại.");
    }
  };

  const runScheduler = async () => {
    setMessage("");
    try {
      const result = await runMutation.mutateAsync({ date: runDate });
      setMessage(
        `Đã tạo ${result.materialized.created} instance, bỏ qua ${result.materialized.skipped}, lỗi ${result.materialized.failed}. Missed cập nhật: ${result.missed.updated}.`,
      );
      await utils.taskInstance.getVirtual.invalidate();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Chạy scheduler thất bại.",
      );
    }
  };

  const runMissedStatusScheduler = async () => {
    setMessage("");
    try {
      const result = await runMissedMutation.mutateAsync();
      setMessage(
        `Đã kiểm tra ${result.matched} task instance quá hạn, cập nhật ${result.updated} task thành missed.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Chạy job missed thất bại.",
      );
    }
  };

  const cleanup = async () => {
    if (!lastBatchId) return;
    setMessage("");
    try {
      const result = await cleanupMutation.mutateAsync({
        batchId: lastBatchId,
      });
      setMessage(
        `Đã soft-delete ${result.taskMasters} task master và ${result.taskInstances} instance.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cleanup thất bại.");
    }
  };

  return (
    <>
      <PageHead title="Local task scheduler test" />
      <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-10">
        <header>
          <p className="text-sm font-medium text-red-600">LOCAL TEST TOOLS</p>
          <h1 className="mt-2 text-2xl font-bold text-light-1000 dark:text-dark-1000">
            Test daily task scheduler
          </h1>
          <p className="mt-2 text-sm text-light-900 dark:text-dark-900">
            Tạo task master test, materialize ngay và kiểm tra duplicate. Không
            dùng cho dữ liệu production.
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-light-600 p-5 dark:border-dark-600">
          <h2 className="font-semibold">1. Seed daily tasks</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm">
              Số lượng task
              <input
                className="mt-1 block w-full rounded border p-2"
                type="number"
                min={1}
                max={100}
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
              />
            </label>
            <label className="text-sm">
              Ngày chạy scheduler
              <input
                className="mt-1 block w-full rounded border p-2"
                type="date"
                value={runDate}
                onChange={(event) => setRunDate(event.target.value)}
              />
            </label>
            <label className="text-sm">
              Ngày bắt đầu
              <input
                className="mt-1 block w-full rounded border p-2"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="text-sm">
              Ngày kết thúc
              <input
                className="mt-1 block w-full rounded border p-2"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label className="text-sm">
              Giờ bắt đầu
              <input
                className="mt-1 block w-full rounded border p-2"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </label>
            <label className="text-sm">
              Giờ kết thúc
              <input
                className="mt-1 block w-full rounded border p-2"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Nhân viên nhận task</p>
            <div className="grid gap-2 md:grid-cols-2">
              {usersQuery.data?.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-2 rounded border p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => toggleUser(user.id)}
                  />
                  <span>
                    {user.name ?? user.username ?? user.email ?? user.id}
                  </span>
                </label>
              ))}
            </div>
            {usersQuery.isLoading && (
              <p className="text-sm">Đang tải nhân viên...</p>
            )}
            {usersQuery.isError && (
              <p className="text-sm text-red-600">{usersQuery.error.message}</p>
            )}
          </div>

          <button
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={seedMutation.isPending}
            onClick={() => void seed()}
          >
            {seedMutation.isPending ? "Đang seed..." : "Seed daily tasks"}
          </button>
        </section>

        <section className="space-y-4 rounded-lg border border-light-600 p-5 dark:border-dark-600">
          <h2 className="font-semibold">2. Chạy scheduler thủ công</h2>
          <p className="text-sm text-light-900 dark:text-dark-900">
            Chạy materialize và cập nhật trạng thái missed ngay lập tức.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={runMutation.isPending}
              onClick={() => void runScheduler()}
            >
              {runMutation.isPending ? "Đang chạy..." : "Chạy scheduler ngay"}
            </button>
            <button
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={runMissedMutation.isPending}
              onClick={() => void runMissedStatusScheduler()}
            >
              {runMissedMutation.isPending
                ? "Đang chạy..."
                : "Chạy job missed ngay"}
            </button>
            <button
              className="rounded border border-red-600 px-4 py-2 text-sm font-medium text-red-600 disabled:opacity-50"
              disabled={!lastBatchId || cleanupMutation.isPending}
              onClick={() => void cleanup()}
            >
              {cleanupMutation.isPending
                ? "Đang cleanup..."
                : "Cleanup batch cuối"}
            </button>
          </div>
        </section>

        {message && (
          <p className="rounded bg-light-100 p-4 text-sm dark:bg-dark-300">
            {message}
          </p>
        )}
      </main>
    </>
  );
};

TaskSchedulerTestPage.getLayout = (page) =>
  getDashboardLayout(page, undefined, false, "ADMIN");

export default TaskSchedulerTestPage;
