"use client";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface NameSection {
  label: string;
  items: string[];
}

/** Grouped single-name picker; keeps showing a current value that no longer exists in any section. */
export function NameSelect({
  sections,
  value,
  onChange,
  exclude = [],
  placeholder = "选择目标",
  className = "w-full",
}: {
  sections: NameSection[];
  value: string;
  onChange: (v: string) => void;
  exclude?: string[];
  placeholder?: string;
  className?: string;
}) {
  const skip = new Set(exclude);
  const known = sections.some((s) => s.items.includes(value));

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        {value && !known && (
          <SelectGroup>
            <SelectLabel>当前值（不存在）</SelectLabel>
            <SelectItem value={value}>{value}</SelectItem>
          </SelectGroup>
        )}
        {sections.map(
          (s) =>
            s.items.some((i) => !skip.has(i)) && (
              <SelectGroup key={s.label}>
                <SelectLabel>{s.label}</SelectLabel>
                {s.items
                  .filter((i) => !skip.has(i))
                  .map((i) => (
                    <SelectItem key={`${s.label}:${i}`} value={i}>
                      {i}
                    </SelectItem>
                  ))}
              </SelectGroup>
            ),
        )}
      </SelectContent>
    </Select>
  );
}
