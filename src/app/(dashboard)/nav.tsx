"use client";

import { FileCode2Icon, ListTreeIcon, PointerIcon, RssIcon, ServerIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/profiles", label: "配置方案", icon: FileCode2Icon },
  { href: "/subscriptions", label: "订阅", icon: RssIcon },
  { href: "/nodes", label: "节点与监听器", icon: ServerIcon },
  { href: "/rule-providers", label: "规则集", icon: ListTreeIcon },
  { href: "/pointers", label: "密码指针", icon: PointerIcon, group: "工具" },
  { href: "/settings", label: "设置", icon: SettingsIcon, group: "系统" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5">
      {LINKS.map(({ href, label, icon: Icon, group }) => (
        <Fragment key={href}>
          {group && <div className="mb-1 mt-4 px-2 text-xs text-muted-foreground">{group}</div>}
          <Link
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              pathname.startsWith(href) && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        </Fragment>
      ))}
    </nav>
  );
}
