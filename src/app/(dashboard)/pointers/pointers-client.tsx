"use client";

import { DicesIcon, EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

function generateBase64(byteCount: number): string {
  return btoa(String.fromCharCode(...randomBytes(byteCount)));
}

function generateRandom(length: number, charset: string): string {
  if (!charset) return "";
  return Array.from(randomBytes(length), (b) => charset[b % charset.length]).join("");
}

function PointerDialog({ pointer, onClose }: { pointer: Pointer | null; onClose: () => void }) {
  const [pending, run] = useRun();
  const [name, setName] = useState(pointer?.name ?? "");
  const [value, setValue] = useState(pointer?.value ?? "");
  const [visible, setVisible] = useState(false);

  const [generatorOpen, setGeneratorOpen] = useState(false);

  const submit = () => {
    const yaml = yamlPointerToString(value);
    const options = { success: "已保存", onOk: onClose };
    if (pointer) run(() => updatePointer(pointer.id, yaml), options);
    else run(() => createPointer(name, yaml), options);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) submit();
          }}
        >
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
                className="pr-16 font-mono"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-0.5 right-8"
                title="生成密码"
                aria-label="生成密码"
                onClick={() => setGeneratorOpen(true)}
              >
                <DicesIcon />
              </Button>
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
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {generatorOpen && (
        <GeneratorDialog
          onApply={(generated) => {
            setValue(generated);
            setVisible(true);
            setGeneratorOpen(false);
          }}
          onClose={() => setGeneratorOpen(false)}
        />
      )}
    </Dialog>
  );
}

const GENERATOR_CHARSETS = [
  { key: "upper", label: "大写字母", chars: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
  { key: "lower", label: "小写字母", chars: "abcdefghijklmnopqrstuvwxyz" },
  { key: "digits", label: "数字", chars: "0123456789" },
  { key: "symbols", label: "符号", chars: "!@#$%^&*-_=+" },
] as const;

function GeneratorDialog({ onApply, onClose }: { onApply: (value: string) => void; onClose: () => void }) {
  const [kind, setKind] = useState<"base64" | "uuid" | "random">("base64");
  const [byteCount, setByteCount] = useState(24);
  const [length, setLength] = useState(32);
  const [charsets, setCharsets] = useState<Record<string, boolean>>({ upper: true, lower: true, digits: true, symbols: false });
  const [preview, setPreview] = useState("");
  const [visible, setVisible] = useState(false);

  const charset = GENERATOR_CHARSETS.filter(({ key }) => charsets[key]).map(({ chars }) => chars).join("");
  const valid = kind === "uuid" || (kind === "base64" ? byteCount >= 1 && byteCount <= 64 : length >= 1 && length <= 128 && !!charset);

  useEffect(() => {
    if (kind === "uuid") setPreview(crypto.randomUUID());
    else if (kind === "base64") setPreview(byteCount >= 1 && byteCount <= 64 ? generateBase64(byteCount) : "");
    else setPreview(length >= 1 && length <= 128 ? generateRandom(length, charset) : "");
  }, [kind, byteCount, length, charset]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>生成密码</DialogTitle>
          <DialogDescription>选择类型并调整参数，点击应用填入密码框。</DialogDescription>
        </DialogHeader>
        <Tabs value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
          <TabsList>
            <TabsTrigger value="base64">Base64</TabsTrigger>
            <TabsTrigger value="uuid">UUID</TabsTrigger>
            <TabsTrigger value="random">随机字符串</TabsTrigger>
          </TabsList>
        </Tabs>
        {kind === "base64" && (
          <div className="grid gap-2">
            <Label htmlFor="generator-bytes">长度（字节）</Label>
            <Input
              id="generator-bytes"
              type="number"
              min={1}
              max={64}
              value={byteCount}
              onChange={(event) => setByteCount(Number(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">输出长度 {4 * Math.ceil(byteCount / 3) || 0} 个字符</p>
          </div>
        )}
        {kind === "uuid" && <p className="text-sm text-muted-foreground">生成标准 UUID v4，无需参数。</p>}
        {kind === "random" && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="generator-length">长度</Label>
              <Input
                id="generator-length"
                type="number"
                min={1}
                max={128}
                value={length}
                onChange={(event) => setLength(Number(event.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <Label>字符集</Label>
              <div className="flex flex-wrap gap-4">
                {GENERATOR_CHARSETS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={charsets[key]}
                      onCheckedChange={(checked) => setCharsets((current) => ({ ...current, [key]: checked === true }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {!charset && <p className="text-xs text-destructive">至少选择一种字符集</p>}
            </div>
          </>
        )}
        <div className="grid gap-2">
          <Label htmlFor="generator-preview">预览</Label>
          <div className="relative flex items-center">
            <Input id="generator-preview" type={visible ? "text" : "password"} value={preview} readOnly className="pr-16 font-mono" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-0.5 right-8"
              title="重新生成"
              aria-label="重新生成"
              onClick={() =>
                setPreview(
                  kind === "uuid"
                    ? crypto.randomUUID()
                    : kind === "base64"
                      ? generateBase64(byteCount)
                      : generateRandom(length, charset),
                )
              }
            >
              <RefreshCwIcon />
            </Button>
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
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" disabled={!valid || !preview} onClick={() => onApply(preview)}>
            应用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
