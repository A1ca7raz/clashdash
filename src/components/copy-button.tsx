"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label, size = "sm" }: { value: string; label?: string; size?: "sm" | "icon-sm" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };
  return (
    <Button variant="outline" size={size} onClick={copy} title="复制">
      {copied ? <CheckIcon /> : <CopyIcon />}
      {label}
    </Button>
  );
}
