import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { uuid_ossp } from "@electric-sql/pglite/contrib/uuid_ossp";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePgLite } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";

import { createLogger } from "@kan/logger";

import * as schema from "./schema";

const log = createLogger("db");

export type dbClient = NodePgDatabase<typeof schema> & {
  $client?: Pool;
};

interface DatabaseSingleton {
  db: dbClient;
  pool: Pool | null;
}

const DATABASE_SINGLETON_SYMBOL = Symbol.for("@kan/db/database-singleton");
const globalForDatabase = globalThis as typeof globalThis &
  Record<symbol, DatabaseSingleton | undefined>;

const getDatabaseSingleton = () => globalForDatabase[DATABASE_SINGLETON_SYMBOL];

const setDatabaseSingleton = (singleton: DatabaseSingleton) => {
  globalForDatabase[DATABASE_SINGLETON_SYMBOL] = singleton;
};

const initializeDatabase = (): DatabaseSingleton => {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    log.warn("POSTGRES_URL not set, falling back to PGLite");

    const client = new PGlite({
      dataDir: "./pgdata",
      extensions: { uuid_ossp },
    });
    const db = drizzlePgLite(client, { schema });

    void migrate(db, { migrationsFolder: "./migrations" });

    return {
      db: db as unknown as dbClient,
      pool: null,
    };
  }

  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  pool.on("error", (error: Error & { code?: string }) => {
    log.error(
      { code: error.code, message: error.message },
      "Unexpected PostgreSQL pool error",
    );
  });

  return {
    db: drizzlePg(pool, { schema }) as dbClient,
    pool,
  };
};

export const createDrizzleClient = (): dbClient => {
  const existingSingleton = getDatabaseSingleton();
  if (existingSingleton) return existingSingleton.db;

  const singleton = initializeDatabase();
  setDatabaseSingleton(singleton);

  return singleton.db;
};

export const getPostgresPool = (): Pool | null => {
  const singleton = getDatabaseSingleton();
  if (singleton) return singleton.pool;

  createDrizzleClient();
  return getDatabaseSingleton()?.pool ?? null;
};
