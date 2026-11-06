import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { subscriptions } from "@/db/schema";
import { SubscriptionsClient } from "./subscriptions-client";

export default async function SubscriptionsPage() {
  const db = await getDb();
  const rows = await db.select().from(subscriptions).orderBy(asc(subscriptions.sort), asc(subscriptions.id));
  return <SubscriptionsClient subscriptions={rows} />;
}
