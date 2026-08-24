import { afterEach, describe, expect, it, vi } from "vitest";

import type { registerDatabasePool } from "./instrumentation-node";

type PostgresPool = NonNullable<Parameters<typeof registerDatabasePool>[0]>;

afterEach(() => {
  vi.resetModules();
});

describe("registerDatabasePool", () => {
  it("attaches a PostgreSQL pool only once per Node.js runtime", async () => {
    const instrumentation = (await import("./instrumentation-node")) as {
      registerDatabasePool?: typeof registerDatabasePool;
    };
    const pool = {} as PostgresPool;
    const attachedPools: PostgresPool[] = [];

    instrumentation.registerDatabasePool?.(pool, (attachedPool) => {
      attachedPools.push(attachedPool);
    });
    instrumentation.registerDatabasePool?.(pool, (attachedPool) => {
      attachedPools.push(attachedPool);
    });

    expect(attachedPools).toEqual([pool]);
  });

  it("does not attach a pool when PostgreSQL is not configured", async () => {
    const instrumentation = (await import("./instrumentation-node")) as {
      registerDatabasePool?: typeof registerDatabasePool;
    };
    const attachedPools: PostgresPool[] = [];

    instrumentation.registerDatabasePool?.(null, (attachedPool) => {
      attachedPools.push(attachedPool);
    });

    expect(attachedPools).toEqual([]);
  });
});
