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

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        端口、DNS、TUN、sniffer 等顶层配置，原样输出并保留注释。以下字段由平台生成，不能写在这里：
        <span className="font-mono text-xs">{MANAGED_KEYS.join("、")}</span>。
      </p>
      <YamlEditor value={text} onChange={setText} height="560px" />
      <div className="flex gap-2">
        <Button disabled={pending || !dirty} onClick={() => run(() => saveBaseConfig(profile.id, text), { success: "已保存" })}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Button variant="outline" disabled={!dirty} onClick={() => setText(profile.baseConfig)}>
          撤销修改
        </Button>
        <Button variant="ghost" onClick={() => setText(DEFAULT_BASE_CONFIG)}>
          填入默认模板
        </Button>
      </div>
    </div>
  );
}
