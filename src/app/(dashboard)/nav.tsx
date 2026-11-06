"use client";

import { FileCode2Icon, ListTreeIcon, RssIcon, ServerIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/profiles", label: "配置方案", icon: FileCode2Icon },
  { href: "/subscriptions", label: "订阅", icon: RssIcon },
  { href: "/nodes", label: "节点与监听器", icon: ServerIcon },
  { href: "/rule-providers", label: "规则集", icon: ListTreeIcon },
  { href: "/settings", label: "设置", icon: SettingsIcon },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5">
      {LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            pathname.startsWith(href) && "bg-muted font-medium text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
