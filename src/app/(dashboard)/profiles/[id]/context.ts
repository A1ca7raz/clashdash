"use client";

import { createContext, useContext } from "react";
import type { Listener, Profile, ProxyGroup, Rule } from "@/db/schema";
import type { ProfileResourceSelection, SubscriptionMode } from "@/lib/types";
import type { YamlPointerDefinition } from "@/lib/yaml-pointer";

export interface SubscriptionSummary {
  id: number;
  name: string;
  mode: SubscriptionMode;
  enabled: boolean;
}

export interface ManualNodeSummary {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

export interface EditorData {
  origin: string;
  profile: Profile & ProfileResourceSelection;
  subscriptions: SubscriptionSummary[];
  manualNodes: ManualNodeSummary[];
  groups: ProxyGroup[];
  rules: Rule[];
  /** All reusable listeners; the profile selects some via `profile_listeners`. */
  listeners: Listener[];
  ruleProviderNames: string[];
  proxyNames: string[];
  sourceNames: Record<string, string[]>;
  pointers: YamlPointerDefinition[];
}

export const EditorContext = createContext<EditorData | null>(null);

export function useEditor(): EditorData & { subRuleNames: string[]; groupNames: string[] } {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("EditorContext missing");
  const subRuleNames = [...new Set(ctx.rules.map((r) => r.subRule).filter((s): s is string => !!s))].sort();
  return { ...ctx, subRuleNames, groupNames: ctx.groups.map((g) => g.name) };
}
