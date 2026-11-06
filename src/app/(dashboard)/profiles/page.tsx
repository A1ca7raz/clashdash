import { asc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profiles, proxyGroups, rules } from "@/db/schema";
import { getOrigin } from "@/server/origin";
import { ProfilesClient } from "./profiles-client";

export default async function ProfilesPage() {
  const db = await getDb();
  const countBy = (table: typeof proxyGroups | typeof rules) =>
    db
      .select({ profileId: table.profileId, count: sql<number>`count(*)::int` })
      .from(table)
      .groupBy(table.profileId);
  const [rows, groupCounts, ruleCounts] = await Promise.all([
    db.select().from(profiles).orderBy(asc(profiles.sort), asc(profiles.id)),
    countBy(proxyGroups),
    countBy(rules),
  ]);
  const toMap = (list: { profileId: number; count: number }[]) => Object.fromEntries(list.map((c) => [c.profileId, c.count]));

  return (
    <ProfilesClient
      origin={await getOrigin()}
      profiles={rows.map((p) => ({
        id: p.id,
        name: p.name,
        token: p.token,
        subscriptionCount: p.subscriptionIds.length,
        listenerCount: p.listenerIds.length,
      }))}
      counts={{ groups: toMap(groupCounts), rules: toMap(ruleCounts) }}
    />
  );
}
