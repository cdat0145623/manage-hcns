import type { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import type { dbClient } from "@kan/db/client";
import * as schema from "@kan/db/schema";

const ROLLBACK_SENTINEL = new Error("ROLLBACK_POSTGRES_TEST_TRANSACTION");

export async function startPostgresTestTransaction(pool: Pool): Promise<{
  db: dbClient;
  rollback: () => Promise<void>;
}> {
  const rawDb = drizzle(pool, { schema });
  let resolveReady: ((db: dbClient) => void) | undefined;
  let releaseTransaction: (() => void) | undefined;
  const ready = new Promise<dbClient>((resolve) => {
    resolveReady = resolve;
  });

  const transaction = rawDb.transaction(async (tx) => {
    resolveReady?.(tx as unknown as dbClient);
    await new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    throw ROLLBACK_SENTINEL;
  });

  const db = await ready;

  return {
    db,
    rollback: async () => {
      releaseTransaction?.();
      try {
        await transaction;
      } catch (error) {
        if (error !== ROLLBACK_SENTINEL) throw error;
      }
    },
  };
}
