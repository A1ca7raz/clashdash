import { asc, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { profileListeners, profiles, profileSubscriptions, proxyGroups, rules } from "@/db/schema";
import { DIVIDER_RULE_TYPE } from "@/lib/types";
import { getOrigin } from "@/server/origin";
import { ProfilesClient } from "./profiles-client";

export default async function ProfilesPage() {
  const db = await getDb();
  const countBy = (table: typeof proxyGroups | typeof rules | typeof profileSubscriptions | typeof profileListeners) =>
    db
      .select({ profileId: table.profileId, count: sql<number>`count(*)::int` })
      .from(table)
      .groupBy(table.profileId);
  const [rows, groupCounts, ruleCounts, subscriptionCounts, listenerCounts] = await Promise.all([
    db.select().from(profiles).orderBy(asc(profiles.sort), asc(profiles.id)),
    countBy(proxyGroups),
    db
      .select({ profileId: rules.profileId, count: sql<number>`count(*)::int` })
      .from(rules)
      .where(ne(rules.type, DIVIDER_RULE_TYPE))
      .groupBy(rules.profileId),
    countBy(profileSubscriptions),
    countBy(profileListeners),
  ]);
  const toMap = (list: { profileId: number; count: number }[]) => Object.fromEntries(list.map((c) => [c.profileId, c.count]));
  const subscriptionCount = toMap(subscriptionCounts);
  const listenerCount = toMap(listenerCounts);

  return (
    <ProfilesClient
      origin={await getOrigin()}
      profiles={rows.map((p) => ({
        id: p.id,
        name: p.name,
        token: p.token,
        subscriptionCount: subscriptionCount[p.id] ?? 0,
        listenerCount: listenerCount[p.id] ?? 0,
      }))}
      counts={{ groups: toMap(groupCounts), rules: toMap(ruleCounts) }}
    />
  );
}
