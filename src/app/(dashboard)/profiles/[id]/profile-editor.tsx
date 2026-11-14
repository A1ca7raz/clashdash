"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaseConfigTab } from "./base-config-tab";
import { EditorContext, type EditorData } from "./context";
import { ResourcesTab } from "./resources-tab";
import { RulesTab } from "./rules-tab";
import { SettingsTab } from "./settings-tab";

export function ProfileEditor(props: EditorData) {
  const [tab, setTab] = useState("settings");
  return (
    <EditorContext.Provider value={props}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/profiles" aria-label="返回">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">{props.profile.name}</h1>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="settings">基本设置</TabsTrigger>
          <TabsTrigger value="resources">节点与代理组</TabsTrigger>
          <TabsTrigger value="base">基础配置</TabsTrigger>
          <TabsTrigger value="rules">规则</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="resources">
            <ResourcesTab />
          </TabsContent>
          <TabsContent value="base" forceMount className="data-[state=inactive]:hidden">
            <BaseConfigTab />
          </TabsContent>
          <TabsContent value="rules">
            <RulesTab />
          </TabsContent>
        </div>
      </Tabs>
    </EditorContext.Provider>
  );
}
