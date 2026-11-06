import "server-only";
import { createDb, type Db } from "./client";

const globalForDb = globalThis as unknown as { __clashdashDb?: Promise<Db> };

/** One instance per process; kept on globalThis so dev hot reloads don't open PGlite twice. */
export function getDb(): Promise<Db> {
  globalForDb.__clashdashDb ??= createDb(process.env.DATABASE_URL).catch((err) => {
    globalForDb.__clashdashDb = undefined;
    throw err;
  });
  return globalForDb.__clashdashDb;
}

export type { Db };
