"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MaskedSubscriptionLink({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  const inputLabel = visible ? "点击复制完整订阅链接" : "点击显示完整订阅链接";
  const eyeLabel = visible ? "隐藏订阅链接" : "显示订阅链接";

  useEffect(() => setVisible(false), [value]);

  const activate = async () => {
    if (!visible) {
      setVisible(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success("已复制订阅链接");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <div className="relative flex min-w-0 flex-1 items-center">
      <Input
        readOnly
        aria-label={inputLabel}
        value={visible ? value : "•".repeat(32)}
        className="cursor-pointer pr-9 font-mono text-xs"
        title={inputLabel}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void activate();
          }
        }}
        onFocus={(e) => visible && e.target.select()}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-0.5 right-0.5"
        title={eyeLabel}
        aria-label={eyeLabel}
        onClick={(e) => {
          e.stopPropagation();
          setVisible((v) => !v);
        }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    </div>
  );
}
