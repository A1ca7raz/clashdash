"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const THEMES = [
  { value: "light", label: "浅色", icon: SunIcon },
  { value: "dark", label: "深色", icon: MoonIcon },
  { value: "system", label: "跟随系统", icon: MonitorIcon },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = THEMES.find((item) => item.value === theme) ?? THEMES[2];
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  const Icon = current.icon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={mounted ? `主题：${current.label}` : "切换主题"}
      aria-label={mounted ? `主题：${current.label}，切换到${next.label}` : "切换主题"}
      disabled={!mounted}
      onClick={() => setTheme(next.value)}
    >
      <Icon />
    </Button>
  );
}
