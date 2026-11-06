"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NO_RESOLVE_RULE_TYPES, RULE_TYPES, type RuleType } from "@/lib/types";
import { useEditor } from "./context";
import { PolicySelect } from "./policy-select";

export interface RuleDraft {
  type: RuleType;
  payload: string;
  target: string;
  noResolve: boolean;
  remark: string;
}

export const EMPTY_RULE: RuleDraft = { type: "DOMAIN-SUFFIX", payload: "", target: "", noResolve: false, remark: "" };

const PAYLOAD_HINTS: Partial<Record<RuleType, string>> = {
  AND: "((DOMAIN,a.com),(NETWORK,UDP))",
  OR: "((DOMAIN,a.com),(DOMAIN,b.com))",
  NOT: "((DOMAIN,a.com))",
  "SUB-RULE": "(NETWORK,tcp)",
  "IP-CIDR": "10.0.0.0/8",
  GEOIP: "CN",
  GEOSITE: "google",
  "DST-PORT": "443",
};

export function RuleForm({ value, onChange, currentSet }: { value: RuleDraft; onChange: (v: RuleDraft) => void; currentSet: string | null }) {
  const { ruleProviderNames, subRuleNames } = useEditor();
  const set = (patch: Partial<RuleDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-[11rem_1fr_13rem] gap-2">
      <Select value={value.type} onValueChange={(t) => set({ type: t as RuleType, noResolve: false })}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-80">
          {RULE_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.type === "MATCH" ? (
        <div className="flex items-center px-2 text-sm text-muted-foreground">匹配所有剩余流量</div>
      ) : value.type === "RULE-SET" ? (
        <Select value={value.payload || undefined} onValueChange={(payload) => set({ payload })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={ruleProviderNames.length ? "选择规则集" : "请先在「规则集」页面添加"} />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-80">
            {ruleProviderNames.map((n) => (
              <SelectItem key={n} value={n}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value.payload}
          placeholder={PAYLOAD_HINTS[value.type] ?? "内容"}
          className="font-mono"
          onChange={(e) => set({ payload: e.target.value })}
        />
      )}

      {value.type === "SUB-RULE" ? (
        <Select value={value.target || undefined} onValueChange={(target) => set({ target })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择子规则" />
          </SelectTrigger>
          <SelectContent position="popper">
            {subRuleNames
              .filter((n) => n !== currentSet)
              .map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      ) : (
        <PolicySelect value={value.target} onChange={(target) => set({ target })} />
      )}

      <div className="col-span-3 flex items-center gap-4">
        <Input value={value.remark} placeholder="备注（可选）" onChange={(e) => set({ remark: e.target.value })} />
        {NO_RESOLVE_RULE_TYPES.includes(value.type) && (
          <label className="flex shrink-0 items-center gap-2 text-sm">
            <Checkbox checked={value.noResolve} onCheckedChange={(v) => set({ noResolve: v === true })} />
            no-resolve
          </label>
        )}
      </div>
    </div>
  );
}
