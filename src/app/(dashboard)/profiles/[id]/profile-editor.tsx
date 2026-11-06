"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BaseConfigTab } from "./base-config-tab";
import { EditorContext, type EditorData } from "./context";
import { GroupsTab } from "./groups-tab";
import { PreviewTab } from "./preview-tab";
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
          <TabsTrigger value="settings">订阅与链接</TabsTrigger>
          <TabsTrigger value="base">基础配置</TabsTrigger>
          <TabsTrigger value="groups">代理组</TabsTrigger>
          <TabsTrigger value="rules">规则</TabsTrigger>
          <TabsTrigger value="preview">预览</TabsTrigger>
        </TabsList>
        <div className="mt-4">
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
          <TabsContent value="base" forceMount className="data-[state=inactive]:hidden">
            <BaseConfigTab />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsTab />
          </TabsContent>
          <TabsContent value="rules">
            <RulesTab />
          </TabsContent>
          <TabsContent value="preview">
            <PreviewTab />
          </TabsContent>
        </div>
      </Tabs>
    </EditorContext.Provider>
  );
}
