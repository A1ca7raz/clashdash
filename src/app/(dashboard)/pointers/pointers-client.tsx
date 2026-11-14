"use client";

import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRun } from "@/components/use-run";
import type { Pointer } from "@/db/schema";
import { yamlPointerToString } from "@/lib/yaml-pointer";
import { createPointer, deletePointer, updatePointer } from "@/server/actions/pointers";

export function PointersClient({ pointers, usage }: { pointers: Pointer[]; usage: Record<number, number> }) {
  const [pending, run] = useRun();
  const [editing, setEditing] = useState<Pointer | "new" | null>(null);

  return (
    <>
      <PageHeader
        title="密码指针"
        description={
          <>
            使用 <code>password: *shared-password</code> 引用字符串密码；密码指针全局跨方案共享，只能作为 password
            字段的值，服务端展开后最终配置不包含别名。
          </>
        }
        actions={
          <Button onClick={() => setEditing("new")}>
            <PlusIcon />
            添加密码指针
          </Button>
        }
      />
      {pointers.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">还没有密码指针</div>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>密码</TableHead>
                <TableHead className="w-20">引用</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pointers.map((pointer) => {
                const count = usage[pointer.id] ?? 0;
                return (
                  <TableRow key={pointer.id}>
                    <TableCell className="font-medium">{pointer.name}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs tracking-widest" aria-label="密码已隐藏">
                        ••••••••
                      </span>
                    </TableCell>
                    <TableCell>{count}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => setEditing(pointer)}>
                        <PencilIcon />
                        <span className="sr-only">编辑密码指针「{pointer.name}」</span>
                      </Button>
                      <ConfirmButton
                        title={count ? `删除密码指针「${pointer.name}」并固化引用？` : `删除密码指针「${pointer.name}」？`}
                        description={
                          count
                            ? `${count} 个配置对象中的引用将替换为当前值，此后不再随密码指针更新。仍确定删除吗？`
                            : "此操作无法撤销。"
                        }
                        disabled={pending}
                        onConfirm={() => run(() => deletePointer(pointer.id), { success: "已删除" })}
                      >
                        <Trash2Icon />
                        <span className="sr-only">删除密码指针「{pointer.name}」</span>
                      </ConfirmButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && <PointerDialog pointer={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PointerDialog({ pointer, onClose }: { pointer: Pointer | null; onClose: () => void }) {
  const [pending, run] = useRun();
  const [name, setName] = useState(pointer?.name ?? "");
  const [value, setValue] = useState(pointer?.value ?? "");
  const [visible, setVisible] = useState(false);

  const submit = () => {
    const yaml = yamlPointerToString(value);
    const options = { success: "已保存", onOk: onClose };
    if (pointer) run(() => updatePointer(pointer.id, yaml), options);
    else run(() => createPointer(name, yaml), options);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pointer ? `编辑密码指针「${pointer.name}」` : "添加密码指针"}</DialogTitle>
          <DialogDescription>
            {pointer ? "名称固定不可修改，只能更新密码。" : "名称创建后不可修改，密码可跨配置方案共享。"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="pointer-name">名称</Label>
          <Input
            id="pointer-name"
            value={name}
            readOnly={!!pointer}
            onChange={(event) => setName(event.target.value)}
            placeholder="shared-password"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pointer-value">密码</Label>
          <div className="relative flex items-center">
            <Input
              id="pointer-value"
              type={visible ? "text" : "password"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="pr-9 font-mono"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-0.5 right-0.5"
              title={visible ? "隐藏密码" : "显示密码"}
              aria-label={visible ? "隐藏密码" : "显示密码"}
              onClick={() => setVisible((current) => !current)}
            >
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button disabled={pending} onClick={submit}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
