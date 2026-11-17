"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import { DEFAULT_BASE_CONFIG, MANAGED_KEYS } from "@/lib/base-config";
import { saveBaseConfig } from "@/server/actions/profiles";
import { useEditor } from "./context";

export function BaseConfigTab() {
  const { profile } = useEditor();
  const [pending, run] = useRun();
  const [text, setText] = useState(profile.baseConfig);
  const dirty = text !== profile.baseConfig;

  const save = () => run(() => saveBaseConfig(profile.id, text), { success: "已保存" });
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">基础配置</h2>
        <p className="text-sm text-muted-foreground">端口、DNS、TUN、sniffer 等顶层配置，原样输出并保留注释。</p>
      </div>
      <p className="text-xs text-muted-foreground">
        以下字段由平台生成，不能写在这里：<span className="font-mono">{MANAGED_KEYS.join("、")}</span>。
      </p>
      <YamlEditor value={text} onChange={setText} height="560px" onSubmit={() => !(pending || !dirty) && save()} />
      <div className="flex items-center gap-1">
        <Button disabled={pending || !dirty} onClick={save}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Button variant="ghost" disabled={!dirty} onClick={() => setText(profile.baseConfig)}>
          撤销修改
        </Button>
        <Button variant="ghost" onClick={() => setText(DEFAULT_BASE_CONFIG)}>
          填入默认基础配置
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">按 Alt+Enter 保存</span>
      </div>
    </div>
  );
}
