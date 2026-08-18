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
      currentMinutesOfDay: 6 * 60,
    });

    expect(schedule).toHaveBeenNthCalledWith(
      1,
      MATERIALIZE_SCHEDULE,
      expect.any(Function),
      { timezone: "Asia/Ho_Chi_Minh" },
    );
    expect(schedule).toHaveBeenNthCalledWith(
      2,
      "5,20,35,50 8-23 * * *",
      expect.any(Function),
      { timezone: "Asia/Ho_Chi_Minh" },
    );
    expect(MISSED_STATUS_SCHEDULE).toBe("5,20,35,50 8-23 * * *");
  });

  it("materializes today on startup at or after 07:00", async () => {
    const materializeToday = vi.fn();

    await registerTaskInstanceScheduler({
      schedule: vi.fn(() => ({ stop: vi.fn() })),
      materializeToday,
      updateMissedNow: vi.fn(),
      currentMinutesOfDay: 7 * 60,
    });

    expect(materializeToday).toHaveBeenCalledTimes(1);
  });

  it("does not check missed instances on startup before 08:05", async () => {
    const updateMissedNow = vi.fn();

    await registerTaskInstanceScheduler({
      schedule: vi.fn(() => ({ stop: vi.fn() })),
      materializeToday: vi.fn(),
      updateMissedNow,
      currentMinutesOfDay: 8 * 60 + 4,
    });

    expect(updateMissedNow).not.toHaveBeenCalled();
  });

  it("checks missed instances once on startup at or after 08:05", async () => {
    const updateMissedNow = vi.fn();

    await registerTaskInstanceScheduler({
      schedule: vi.fn(() => ({ stop: vi.fn() })),
      materializeToday: vi.fn(),
      updateMissedNow,
      currentMinutesOfDay: 8 * 60 + 5,
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
      currentMinutesOfDay: 6 * 60,
    });

    callbacks[0]?.();
    callbacks[0]?.();
    await vi.waitFor(() => expect(materializeToday).toHaveBeenCalledTimes(1));

    releaseMaterialize?.();
  });
});
