import { describe, expect, it, vi } from "vitest";

import {
  MATERIALIZE_SCHEDULE,
  MISSED_STATUS_SCHEDULE,
  registerTaskInstanceScheduler,
} from "./task-instance-scheduler";

describe("registerTaskInstanceScheduler", () => {
  it("registers the production schedules in the application timezone", async () => {
    const schedule = vi.fn(() => ({ stop: vi.fn() }));

    await registerTaskInstanceScheduler({
      schedule,
      materializeToday: vi.fn(),
      updateMissedNow: vi.fn(),
      currentHour: 6,
    });

    expect(schedule).toHaveBeenNthCalledWith(
      1,
      MATERIALIZE_SCHEDULE,
      expect.any(Function),
      { timezone: "Asia/Ho_Chi_Minh" },
    );
    expect(schedule).toHaveBeenNthCalledWith(
      2,
      MISSED_STATUS_SCHEDULE,
      expect.any(Function),
      { timezone: "Asia/Ho_Chi_Minh" },
    );
  });

  it("materializes today on startup at or after 07:00", async () => {
    const materializeToday = vi.fn();

    await registerTaskInstanceScheduler({
      schedule: vi.fn(() => ({ stop: vi.fn() })),
      materializeToday,
      updateMissedNow: vi.fn(),
      currentHour: 7,
    });

    expect(materializeToday).toHaveBeenCalledTimes(1);
  });

  it("always checks missed instances once on startup", async () => {
    const updateMissedNow = vi.fn();

    await registerTaskInstanceScheduler({
      schedule: vi.fn(() => ({ stop: vi.fn() })),
      materializeToday: vi.fn(),
      updateMissedNow,
      currentHour: 6,
    });

    expect(updateMissedNow).toHaveBeenCalledTimes(1);
  });

  it("does not overlap executions of the same job", async () => {
    let releaseMaterialize: (() => void) | undefined;
    const materializeToday = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseMaterialize = resolve;
        }),
    );
    const callbacks: (() => void)[] = [];

    await registerTaskInstanceScheduler({
      schedule: vi.fn((_expression: string, callback: () => void) => {
        callbacks.push(callback);
        return { stop: vi.fn() };
      }),
      materializeToday,
      updateMissedNow: vi.fn(),
      currentHour: 6,
    });

    callbacks[0]?.();
    callbacks[0]?.();
    await vi.waitFor(() => expect(materializeToday).toHaveBeenCalledTimes(1));

    releaseMaterialize?.();
  });
});
