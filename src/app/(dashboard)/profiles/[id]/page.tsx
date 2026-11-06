import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { getOrigin } from "@/server/origin";
import { generateForProfile } from "@/server/profile-data";
import { ProfileEditor } from "./profile-editor";

const bySort = <T extends { sort: number; id: number }>(a: T, b: T) => a.sort - b.sort || a.id - b.id;

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, Number(id)));
  if (!profile) notFound();

  const { input, result } = await generateForProfile(db, profile);
  return (
    <ProfileEditor
      origin={await getOrigin()}
      profile={profile}
      subscriptions={input.subscriptions.map((s) => ({ id: s.id, name: s.name, mode: s.mode, enabled: s.enabled }))}
      manualNodes={input.nodes
        .filter((n) => n.subscriptionId === null)
        .sort(bySort)
        .map((n) => ({ id: n.id, name: n.name, type: n.type, enabled: n.enabled }))}
      groups={[...input.groups].sort(bySort)}
      rules={[...input.rules].sort(bySort)}
      listeners={[...input.listeners].sort(bySort)}
      ruleProviderNames={input.ruleProviders.map((p) => p.name)}
      proxyNames={result.proxyNames}
      sourceNames={result.sourceNames}
    />
  );
}
