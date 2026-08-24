import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@electric-sql/pglite", () => ({ PGlite: vi.fn() }));
vi.mock("@electric-sql/pglite/contrib/uuid_ossp", () => ({ uuid_ossp: {} }));
vi.mock("drizzle-orm/pglite", () => ({ drizzle: vi.fn() }));
vi.mock("drizzle-orm/pglite/migrator", () => ({ migrate: vi.fn() }));

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[
    Symbol.for("@kan/db/database-singleton")
  ];
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("createDrizzleClient", () => {
  it("reuses one configured PostgreSQL pool in the same server process", async () => {
    vi.stubEnv(
      "POSTGRES_URL",
      "postgresql://user:password@127.0.0.1:1/kan_test",
    );

    const { createDrizzleClient } = await import("./client");
    const firstClient = createDrizzleClient();
    const secondClient = createDrizzleClient();

    expect(secondClient === firstClient).toBe(true);
    expect(firstClient.$client === secondClient.$client).toBe(true);
    expect(firstClient.$client?.options.max).toBe(5);
    expect(firstClient.$client?.options.connectionTimeoutMillis).toBe(5_000);
    expect(firstClient.$client?.options.idleTimeoutMillis).toBe(10_000);
    expect(firstClient.$client?.listenerCount("error")).toBe(1);
  }, 15_000);

  it("reuses the production pool when the module is loaded in another server chunk", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "POSTGRES_URL",
      "postgresql://user:password@127.0.0.1:1/kan_test",
    );

    const firstModule = await import("./client");
    const firstClient = firstModule.createDrizzleClient();

    vi.resetModules();

    const secondModule = await import("./client");
    const secondClient = secondModule.createDrizzleClient();

    expect(secondClient === firstClient).toBe(true);
    expect(secondClient.$client === firstClient.$client).toBe(true);
  }, 15_000);
});
