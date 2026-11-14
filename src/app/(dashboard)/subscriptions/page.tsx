import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { loadYamlPointers } from "@/server/pointer-references";
import { SubscriptionsClient } from "./subscriptions-client";

export default async function SubscriptionsPage() {
  const db = await getDb();
  const [rows, pointers] = await Promise.all([
    db.select().from(subscriptions).orderBy(asc(subscriptions.sort), asc(subscriptions.id)),
    loadYamlPointers(db),
  ]);
  return <SubscriptionsClient subscriptions={rows} pointers={pointers} />;
}
