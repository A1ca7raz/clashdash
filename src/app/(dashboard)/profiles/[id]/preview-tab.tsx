"use client";

import { AlertTriangleIcon, CircleXIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/use-run";
import { YamlEditor } from "@/components/yaml-editor";
import type { GenerateResult } from "@/lib/generator";
import { previewProfile } from "@/server/actions/profiles";
import { useEditor } from "./context";

export function PreviewTab() {
  const { profile } = useEditor();
  const [pending, run] = useRun();
  const [result, setResult] = useState<GenerateResult | null>(null);

  const load = () => run(() => previewProfile(profile.id), { onOk: setResult });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [profile.id]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={load} disabled={pending}>
          <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
          重新生成
        </Button>
        {result && (
          <>
            <CopyButton value={result.yaml} label="复制" size="sm" />
            <div className="flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">节点 {result.stats.proxies}</Badge>
              <Badge variant="secondary">provider {result.stats.providers}</Badge>
              <Badge variant="secondary">代理组 {result.stats.groups}</Badge>
              <Badge variant="secondary">规则 {result.stats.rules}</Badge>
              <Badge variant="secondary">监听器 {result.stats.listeners}</Badge>
            </div>
          </>
        )}
        <span className="ml-auto text-xs text-muted-foreground">使用已缓存的节点生成，不会拉取订阅。</span>
      </div>

      {result && result.errors.length > 0 && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>配置有 {result.errors.length} 个错误，订阅接口会返回 422，客户端将保留旧配置</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {result && result.warnings.length > 0 && (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>{result.warnings.length} 个警告</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {result ? (
        <YamlEditor value={result.yaml} readOnly height="640px" />
      ) : (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">生成中…</div>
      )}
    </div>
  );
}
