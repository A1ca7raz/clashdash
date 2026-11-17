import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { PGlite } from "@electric-sql/pglite";
import { guardDatabaseClient } from "./guard";
import { guardDb } from "./guard-db";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = path.join(process.cwd(), "drizzle");

function guardPglite(client: PGlite): PGlite {
  guardDatabaseClient(client);
  const transaction = client.transaction.bind(client);
  client.transaction = async (callback) => transaction(async (tx) => callback(guardDatabaseClient(tx)));
  return client;
}

/**
 * `url` set: Neon (serverless driver) or any other Postgres (node-postgres).
 * `url` unset: embedded PGlite, migrated on startup. Pass "memory://" for an in-memory instance.
 */
export async function createDb(url: string | undefined, pgliteDir?: string): Promise<Db> {
  if (url && !url.startsWith("memory://")) {
    if (new URL(url).hostname.endsWith(".neon.tech")) {
      const { Pool, neonConfig } = await import("@neondatabase/serverless");
      const { drizzle } = await import("drizzle-orm/neon-serverless");
      const { default: ws } = await import("ws");
      neonConfig.webSocketConstructor = ws;
      const pool = guardDatabaseClient(new Pool({ connectionString: url }));
      pool.on("connect", guardDatabaseClient);
      return guardDb(drizzle({ client: pool, schema })) as unknown as Db;
    }
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = guardDatabaseClient(new Pool({ connectionString: url, max: 3 }));
    pool.on("connect", guardDatabaseClient);
    return guardDb(drizzle({ client: pool, schema })) as unknown as Db;
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is required on Vercel; PGlite is only for local development.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  let client;
  if (url === "memory://") {
    client = new PGlite();
  } else {
    const dir = pgliteDir ?? process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
    await mkdir(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = guardDb(drizzle({ client: guardPglite(client), schema }));
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}
