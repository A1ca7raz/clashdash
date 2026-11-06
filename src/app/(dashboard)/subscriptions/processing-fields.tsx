"use client";

import { PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Processing } from "@/lib/types";

/** Fields map 1:1 to mihomo proxy-provider filter/override, applied in that fixed order. */
export function ProcessingFields({ value, onChange }: { value: Processing; onChange: (p: Processing) => void }) {
  const set = (patch: Partial<Processing>) => onChange({ ...value, ...patch });
  const rename = value.rename ?? [];

  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        执行顺序与 mihomo 一致：先按原始名称排除、包含过滤，再依次执行改名规则、加国旗、加前缀、加后缀。多个正则可用反引号 ` 分隔；正则语法须同时兼容
        mihomo（regexp2）与浏览器，保存时会校验。
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>包含过滤</Label>
          <Input value={value.include ?? ""} onChange={(e) => set({ include: e.target.value })} placeholder="例如 香港|HK`日本|JP" />
        </div>
        <div className="grid gap-1.5">
          <Label>排除过滤</Label>
          <Input value={value.exclude ?? ""} onChange={(e) => set({ exclude: e.target.value })} placeholder="例如 剩余|过期|官网" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label>改名规则</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => set({ rename: [...rename, { pattern: "", target: "" }] })}
          >
            <PlusIcon />
            添加
          </Button>
        </div>
        {rename.length === 0 && <p className="text-xs text-muted-foreground">替换支持 $1、{"${name}"}、$$ 等写法。</p>}
        {rename.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={r.pattern}
              placeholder="正则"
              onChange={(e) => set({ rename: rename.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)) })}
            />
            <span className="text-muted-foreground">→</span>
            <Input
              value={r.target}
              placeholder="替换为"
              onChange={(e) => set({ rename: rename.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })}
            />
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => set({ rename: rename.filter((_, j) => j !== i) })}>
              <XIcon />
            </Button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
        <label className="flex h-8 items-center gap-2 text-sm">
          <Switch checked={!!value.flag} onCheckedChange={(flag) => set({ flag })} />
          加国旗
        </label>
        <div className="grid gap-1.5">
          <Label>前缀</Label>
          <Input value={value.prefix ?? ""} onChange={(e) => set({ prefix: e.target.value })} />
        </div>
        <div className="grid gap-1.5">
          <Label>后缀</Label>
          <Input value={value.suffix ?? ""} onChange={(e) => set({ suffix: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
