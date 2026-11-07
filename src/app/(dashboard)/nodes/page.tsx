import { asc, isNull } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDb } from "@/db";
import { listeners, nodes, profiles } from "@/db/schema";
import { ListenersPanel } from "./listeners-panel";
import { ManualNodesPanel } from "./nodes-client";

export default async function NodesPage() {
  const db = await getDb();
  const [nodeRows, listenerRows, profileRows] = await Promise.all([
    db.select().from(nodes).where(isNull(nodes.subscriptionId)).orderBy(asc(nodes.sort), asc(nodes.id)),
    db.select().from(listeners).orderBy(asc(listeners.sort), asc(listeners.id)),
    db
      .select({ name: profiles.name, manualNodeIds: profiles.manualNodeIds, listenerIds: profiles.listenerIds })
      .from(profiles)
      .orderBy(asc(profiles.sort), asc(profiles.id)),
  ]);

  const nodeUsedBy: Record<number, string[]> = {};
  const listenerUsedBy: Record<number, string[]> = {};
  for (const p of profileRows) {
    for (const id of p.manualNodeIds) (nodeUsedBy[id] ??= []).push(p.name);
    for (const id of p.listenerIds) (listenerUsedBy[id] ??= []).push(p.name);
  }

  return (
    <>
      <PageHeader title="节点与监听器" description="可在多个配置方案中复用的手动节点和入站监听器。" />
      <Tabs defaultValue="nodes">
        <TabsList>
          <TabsTrigger value="nodes">手动节点（{nodeRows.length}）</TabsTrigger>
          <TabsTrigger value="listeners">监听器（{listenerRows.length}）</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes" className="mt-4">
          <ManualNodesPanel nodes={nodeRows} usedBy={nodeUsedBy} />
        </TabsContent>
        <TabsContent value="listeners" className="mt-4">
          <ListenersPanel listeners={listenerRows} usedBy={listenerUsedBy} />
        </TabsContent>
      </Tabs>
    </>
  );
}
