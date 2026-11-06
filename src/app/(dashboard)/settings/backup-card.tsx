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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useRun } from "@/components/use-run";
import { importBackup } from "@/server/actions/settings";

export function BackupCard() {
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
    <Card>
      <CardHeader>
        <CardTitle>备份与恢复</CardTitle>
        <CardDescription>导出全部订阅、节点、配置方案、规则与监听器为 JSON；恢复会覆盖当前全部数据。</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button variant="outline" asChild>
          <a href="/api/backup" download>
            <DownloadIcon />
            导出备份
          </a>
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
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
              <AlertDialogDescription>当前全部数据会被备份内容替换，且无法撤销。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={doImport}>恢复</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
