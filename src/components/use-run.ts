"use client";

import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "@/server/actions/common";

interface RunOptions<T> {
  success?: string | ((data: T) => string);
  onOk?: (data: T) => void;
}

/** Calls a server action inside a transition and reports the outcome with a toast. */
export function useRun() {
  const [pending, startTransition] = useTransition();
  const run = useCallback(<T>(action: () => Promise<ActionResult<T>>, opts: RunOptions<T> = {}) => {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        const msg = typeof opts.success === "function" ? opts.success(res.data) : opts.success;
        if (msg) toast.success(msg);
        opts.onOk?.(res.data);
      } else {
        toast.error(res.error);
      }
    });
  }, []);
  return [pending, run] as const;
}
