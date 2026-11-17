import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { createDb } from "@/db/client";
import { isDatabaseInitializationRequired, rethrowDatabaseError } from "@/db/errors";
import { listeners } from "@/db/schema";

let db: Db | undefined;

afterEach(async () => {
  if (db) await (db as unknown as { $client: { close: () => Promise<void> } }).$client.close();
  db = undefined;
});

describe("database undefined-table guard", () => {
  it("converts any missing table in queries and transactions", async () => {
    db = await createDb("memory://");
    await db.execute(sql`DROP TABLE listeners CASCADE`);

    await expect(db.select().from(listeners)).rejects.toSatisfy(isDatabaseInitializationRequired);
    await expect(db.transaction(async (tx) => tx.select().from(listeners))).rejects.toSatisfy(isDatabaseInitializationRequired);
  }, 30_000);

  it("does not classify other database failures as initialization", async () => {
    db = await createDb("memory://");
    const error = await db.execute(sql`INVALID SQL`).catch((err) => err);
    expect(isDatabaseInitializationRequired(error)).toBe(false);
    expect(() => rethrowDatabaseError(new Error("connection refused"))).toThrow("connection refused");
    expect(() => rethrowDatabaseError({ cause: { code: "42P01" } })).toThrow("数据库尚未初始化或结构不完整");
  }, 30_000);
});
