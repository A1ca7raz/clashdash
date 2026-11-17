"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import type { ProxyGroup } from "@/db/schema";
import { formatGroupConfigError, groupToYaml, NEW_GROUP_TEMPLATE, parseGroupConfig } from "@/lib/group-config";
import { matchGroupFilter } from "@/lib/processing";
import { validateFilter } from "@/lib/regex";
import { saveGroup } from "@/server/actions/profiles";
import { useEditor } from "./context";

export function GroupDialog({ group, onClose }: { group: ProxyGroup | null; onClose: () => void }) {
  const { profile, subscriptions, sourceNames, pointers } = useEditor();
  const [pending, run] = useRun();
  const [text, setText] = useState(() => (group ? (group.yaml ?? groupToYaml(group, subscriptions)) : NEW_GROUP_TEMPLATE));
  const selectedSubs = subscriptions.filter((s) => profile.subscriptionIds.includes(s.id));

  const parsed = useMemo(() => {
    try {
      return { config: parseGroupConfig(text, pointers) };
    } catch (err) {
      return { error: formatGroupConfigError(err) };
    }
  }, [text, pointers]);

  const preview = useMemo(() => {
    if ("error" in parsed) return { error: parsed.error };
    const { members } = parsed.config;
    const err = (members.include && validateFilter(members.include)) || (members.exclude && validateFilter(members.exclude));
    if (err) return { error: err };

    const byName = new Map(selectedSubs.map((s) => [s.name, s]));
    const selectedNames = members.sources.all ? [] : members.sources.subscriptions;
    const unknown = selectedNames.find((name) => !byName.has(name));
    if (unknown) return { error: `订阅「${unknown}」不存在或未加入当前方案` };

    const subs = members.sources.all ? selectedSubs : selectedNames.map((name) => byName.get(name)!);
    const inline = [
      ...subs.filter((s) => s.mode === "inline").flatMap((s) => sourceNames[s.id] ?? []),
      ...(members.sources.manual ? sourceNames.manual ?? [] : []),
    ];
    const expanded = matchGroupFilter(inline, members.include, members.exclude).filter((n) => !members.items.includes(n));
    const providers = subs
      .filter((s) => s.mode === "provider")
      .map((s) => {
        const snap = sourceNames[s.id];
        return { name: s.name, count: snap ? matchGroupFilter(snap, members.include, members.exclude).length : null };
      });
    return { expanded, providers };
  }, [parsed, selectedSubs, sourceNames]);

  const submit = () =>
    run(() => saveGroup(profile.id, text, group?.id), {
      success: "已保存",
      onOk: onClose,
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{group ? `编辑代理组「${group.name}」` : "添加代理组"}</DialogTitle>
          <DialogDescription>代理组配置（YAML）。指定订阅来源时使用订阅名称，数组成员按顺序输出。</DialogDescription>
        </DialogHeader>

        <YamlEditor value={text} onChange={setText} height="420px" onSubmit={() => !(pending || "error" in parsed) && submit()} />

        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          {"error" in preview ? (
            <span className="text-destructive">{preview.error}</span>
          ) : (
            <div className="grid gap-1">
              <div>
                展开的节点（{preview.expanded.length}）：
                <span className="text-muted-foreground">{preview.expanded.slice(0, 30).join("、") || "无"}</span>
                {preview.expanded.length > 30 && " …"}
              </div>
              {preview.providers.map((p) => (
                <div key={p.name}>
                  provider「{p.name}」：{p.count === null ? "无节点快照，无法预估" : `按快照匹配 ${p.count} 个节点`}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <p className="text-xs text-muted-foreground sm:mr-auto">按 Alt+Enter 保存</p>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={pending || "error" in parsed}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
