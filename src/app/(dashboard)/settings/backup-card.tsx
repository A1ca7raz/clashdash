"use client";

import { DownloadIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useRun } from "@/components/use-run";
import { importBackup } from "@/server/actions/settings";

export function BackupSection() {
  const [pending, run] = useRun();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  const close = () => {
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const doImport = async () => {
    if (!file) return;
    const text = await file.text();
    close();
    run(() => importBackup(text), { success: "已恢复备份" });
  };

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="text-sm font-medium">备份与恢复</h2>
        <p className="text-sm text-muted-foreground">导出配置业务数据为 JSON（不含管理员凭据和两步验证）；恢复会覆盖当前配置业务数据。</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" asChild>
          <a href="/api/backup" download>
            <DownloadIcon />
            导出备份
          </a>
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
          <UploadIcon />
          {pending ? "恢复中…" : "从文件恢复"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <AlertDialog open={!!file} onOpenChange={(o) => !o && close()}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>恢复备份「{file?.name}」？</AlertDialogTitle>
              <AlertDialogDescription>当前配置业务数据会被备份内容替换，且无法撤销；管理员凭据和两步验证保持不变。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={doImport}>恢复</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}
