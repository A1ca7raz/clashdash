import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { DatabaseSchemaIncomplete, initializeEmptyDatabase } from "./database-init";

const migrator = vi.hoisted(() => ({ migrate: vi.fn() }));
vi.mock("drizzle-orm/node-postgres/migrator", () => migrator);

const originalUrl = process.env.DATABASE_URL;
let pglite: Db | undefined;

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://localhost:5432/clashdash";
  delete (globalThis as { __clashdashDatabaseInit?: Promise<void> }).__clashdashDatabaseInit;
  migrator.migrate.mockReset();
});

afterEach(async () => {
  if (pglite) await (pglite as unknown as { $client: { close: () => Promise<void> } }).$client.close();
  pglite = undefined;
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

describe("database initialization", () => {
  it("migrates only when the database has no tables", async () => {
    const db = { execute: vi.fn().mockResolvedValue({ rows: [{ total: 0 }] }) } as unknown as Db;
    await initializeEmptyDatabase(db);
    expect(migrator.migrate).toHaveBeenCalledTimes(1);
  });

  it("refuses to migrate a partially initialized database", async () => {
    pglite = await createDb("memory://");
    await expect(initializeEmptyDatabase(pglite)).rejects.toBeInstanceOf(DatabaseSchemaIncomplete);
    expect(migrator.migrate).not.toHaveBeenCalled();
  }, 30_000);

  it("does not run the external migrator for an empty PGlite database", async () => {
    process.env.DATABASE_URL = "memory://";
    const db = { execute: vi.fn().mockResolvedValue({ rows: [{ total: 0 }] }) } as unknown as Db;
    await initializeEmptyDatabase(db);
    expect(migrator.migrate).not.toHaveBeenCalled();
  });
});
