import "server-only";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

const migrationsFolder = path.join(process.cwd(), "drizzle");
const globalForInit = globalThis as unknown as { __clashdashDatabaseInit?: Promise<void> };

export class DatabaseSchemaIncomplete extends Error {
  constructor() {
    super("数据库结构不完整，请人工检查并修复；已停止自动初始化");
    this.name = "DatabaseSchemaIncomplete";
  }
}

async function isEmptyDatabase(db: Db): Promise<boolean> {
  const result = await db.execute<{ total: number }>(sql`
    SELECT count(*)::int AS total
    FROM information_schema.tables
    WHERE table_schema IN ('public', 'drizzle') AND table_type = 'BASE TABLE'
  `);
  const rows = Array.isArray(result) ? result : (result as { rows: { total: number }[] }).rows;
  return Number(rows[0]?.total ?? 1) === 0;
}

async function migrateDatabase(db: Db): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || url === "memory://") return;
  if (new URL(url).hostname.endsWith(".neon.tech")) {
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    await migrate(db as unknown as NeonDatabase<typeof schema>, { migrationsFolder });
  } else {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as unknown as NodePgDatabase<typeof schema>, { migrationsFolder });
  }
}

export async function initializeEmptyDatabase(db: Db): Promise<void> {
  globalForInit.__clashdashDatabaseInit ??= (async () => {
    if (!(await isEmptyDatabase(db))) throw new DatabaseSchemaIncomplete();
    await migrateDatabase(db);
  })().catch((err) => {
    globalForInit.__clashdashDatabaseInit = undefined;
    throw err;
  });
  return globalForInit.__clashdashDatabaseInit;
}
