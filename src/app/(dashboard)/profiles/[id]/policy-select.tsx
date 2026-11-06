"use client";

import { NameSelect } from "@/components/name-select";
import { BUILTIN_POLICIES } from "@/lib/types";
import { useEditor } from "./context";

/** Picks a rule target or group member: a proxy group, builtin policy, or inline/manual node. */
export function PolicySelect(props: {
  value: string;
  onChange: (v: string) => void;
  exclude?: string[];
  placeholder?: string;
  className?: string;
}) {
  const { groupNames, proxyNames } = useEditor();
  const sections = [
    { label: "代理组", items: groupNames },
    { label: "内置策略", items: [...BUILTIN_POLICIES] },
    { label: "节点", items: proxyNames },
  ];
  return <NameSelect sections={sections} {...props} />;
}
