"use client";

import { useEffect } from "react";
import { isDatabaseInitializationRequired } from "@/db/errors";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const initializationRequired = isDatabaseInitializationRequired(error);
  useEffect(() => {
    if (initializationRequired) window.location.replace("/login?reason=database");
  }, [initializationRequired]);

  return (
    <div className="grid max-w-md gap-3 py-12">
      <h1 className="text-lg font-medium">{initializationRequired ? "数据库需要初始化" : "页面加载失败"}</h1>
      <p className="text-sm text-muted-foreground">
        {initializationRequired ? "正在前往初始化页面。" : error.message}
      </p>
      {!initializationRequired && <Button className="w-fit" variant="outline" onClick={reset}>重试</Button>}
    </div>
  );
}
