import { asc, eq, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/db";
import { listeners, nodes, profileListeners, profileManualNodes, profiles } from "@/db/schema";
import { loadYamlPointers } from "@/server/pointer-references";
import { ListenersPanel } from "./listeners-panel";
import { ManualNodesPanel } from "./nodes-client";

export default async function NodesPage() {
  const db = await getDb();
  const [nodeRows, listenerRows, nodeUsage, listenerUsage, pointers] = await Promise.all([
    db.select().from(nodes).where(isNull(nodes.subscriptionId)).orderBy(asc(nodes.sort), asc(nodes.id)),
    db.select().from(listeners).orderBy(asc(listeners.sort), asc(listeners.id)),
    db
      .select({ id: profileManualNodes.nodeId, name: profiles.name })
      .from(profileManualNodes)
      .innerJoin(profiles, eq(profiles.id, profileManualNodes.profileId)),
    db
      .select({ id: profileListeners.listenerId, name: profiles.name })
      .from(profileListeners)
      .innerJoin(profiles, eq(profiles.id, profileListeners.profileId)),
    loadYamlPointers(db),
  ]);

  const nodeUsedBy: Record<number, string[]> = {};
  const listenerUsedBy: Record<number, string[]> = {};
  for (const row of nodeUsage) (nodeUsedBy[row.id] ??= []).push(row.name);
  for (const row of listenerUsage) (listenerUsedBy[row.id] ??= []).push(row.name);

  return (
    <>
      <PageHeader title="节点与监听器" description="可在多个配置方案中复用的手动节点和入站监听器。" />
      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">手动节点（{nodeRows.length}）</TabsTrigger>
          <TabsTrigger value="listeners">监听器（{listenerRows.length}）</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes" className="mt-4">
          <ManualNodesPanel nodes={nodeRows} usedBy={nodeUsedBy} pointers={pointers} />
        </TabsContent>
        <TabsContent value="listeners" className="mt-4">
          <ListenersPanel listeners={listenerRows} usedBy={listenerUsedBy} pointers={pointers} />
        </TabsContent>
      </Tabs>
    </>
  );
}
