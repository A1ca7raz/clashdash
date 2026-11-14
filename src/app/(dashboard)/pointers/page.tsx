import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { pointerReferences, pointers } from "@/db/schema";
import { PointersClient } from "./pointers-client";

export default async function PointersPage() {
  const db = await getDb();
  const [rows, usage] = await Promise.all([
    db.select().from(pointers).orderBy(asc(pointers.name)),
    db
      .select({ pointerId: pointerReferences.pointerId, count: sql<number>`count(*)::int` })
      .from(pointerReferences)
      .groupBy(pointerReferences.pointerId),
  ]);
  return <PointersClient pointers={rows} usage={Object.fromEntries(usage.map((row) => [row.pointerId, row.count]))} />;
}
