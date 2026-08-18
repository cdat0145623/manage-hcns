import { describe, expect, it, vi } from "vitest";

import { createTaskInstanceSchedulerStarter } from "./task-instance-scheduler-runtime";

describe("createTaskInstanceSchedulerStarter", () => {
  it("shares one scheduler initialization across repeated starts", async () => {
    const schedule = vi.fn(() => ({ stop: vi.fn() }));
    const onRegistered = vi.fn();
    const start = createTaskInstanceSchedulerStarter({
      schedule,
      now: () => new Date("2026-08-18T01:00:00.000Z"),
      materializeToday: vi.fn(),
      updateMissedNow: vi.fn(),
      close: vi.fn(),
      onRegistered,
    });

    const [first, second] = await Promise.all([start(), start()]);

    expect(first).toBe(second);
    expect(schedule).toHaveBeenCalledTimes(2);
    expect(onRegistered).toHaveBeenCalledTimes(1);
  });
});
