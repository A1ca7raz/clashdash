"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRun } from "@/components/use-run";
import {
  beginTotpEnrollment,
  cancelTotpEnrollment,
  changePassword,
  disableTotp,
  enableTotp,
} from "@/server/actions/settings";

export function SecuritySection({ totpEnabled }: { totpEnabled: boolean }) {
  const router = useRouter();
  const [pending, run] = useRun();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordToken, setPasswordToken] = useState("");
  const [enrollPassword, setEnrollPassword] = useState("");
  const [enrollment, setEnrollment] = useState<{ secret: string; uri: string } | null>(null);
  const [enrollToken, setEnrollToken] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");

  const submitPassword = () => {
    if (newPassword !== confirmation) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    run(() => changePassword(currentPassword, newPassword, passwordToken), {
      success: "密码已修改，其他登录会话已失效",
      onOk: () => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
        setPasswordToken("");
      },
    });
  };

  return (
    <>
      <section className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-sm font-medium">修改密码</h2>
          <p className="text-sm text-muted-foreground">修改后其他设备的登录会话会失效。</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="grid gap-1.5">
            <Label>当前密码</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="grid gap-1.5">
            <Label>新密码</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="grid gap-1.5">
            <Label>确认新密码</Label>
            <Input type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="new-password" />
          </div>
        </div>
        {totpEnabled && (
          <div className="grid max-w-sm gap-1.5">
            <Label>两步验证码</Label>
            <Input value={passwordToken} onChange={(e) => setPasswordToken(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
          </div>
        )}
        <div>
          <Button disabled={pending || !currentPassword || !newPassword} onClick={submitPassword}>保存新密码</Button>
        </div>
      </section>

      <section className="grid gap-4 border-t pt-5">
        <div className="grid gap-1">
          <h2 className="text-sm font-medium">TOTP 两步验证</h2>
          <p className="text-sm text-muted-foreground">
            {totpEnabled ? "已启用。登录时除了密码，还需要认证器中的六位验证码。" : "使用 Google Authenticator、1Password 等兼容 TOTP 的认证器。"}
          </p>
        </div>

        {!totpEnabled && !enrollment && (
          <div className="grid max-w-sm gap-3">
            <div className="grid gap-1.5">
              <Label>当前密码</Label>
              <Input type="password" value={enrollPassword} onChange={(e) => setEnrollPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <Button
                disabled={pending || !enrollPassword}
                onClick={() =>
                  run(() => beginTotpEnrollment(enrollPassword), {
                    onOk: (value) => {
                      setEnrollment(value);
                      setEnrollPassword("");
                    },
                  })
                }
              >
                生成密钥并启用
              </Button>
            </div>
          </div>
        )}

        {!totpEnabled && enrollment && (
          <div className="grid gap-4">
            <div className="w-fit rounded-lg border bg-white p-3">
              <QRCodeSVG value={enrollment.uri} size={208} />
            </div>
            <div className="grid max-w-md gap-1.5">
              <Label>手动输入密钥</Label>
              <div className="flex gap-2">
                <Input readOnly value={enrollment.secret} className="font-mono" />
                <CopyButton value={enrollment.secret} />
              </div>
            </div>
            <div className="grid max-w-sm gap-1.5">
              <Label>认证器验证码</Label>
              <Input value={enrollToken} onChange={(e) => setEnrollToken(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </div>
            <div className="flex gap-2">
              <Button
                disabled={pending || !/^\d{6}$/.test(enrollToken)}
                onClick={() =>
                  run(() => enableTotp(enrollToken), {
                    success: "两步验证已启用",
                    onOk: () => {
                      setEnrollment(null);
                      setEnrollToken("");
                      router.refresh();
                    },
                  })
                }
              >
                确认启用
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => cancelTotpEnrollment(), { onOk: () => { setEnrollment(null); setEnrollToken(""); } })}
              >
                取消
              </Button>
            </div>
          </div>
        )}

        {totpEnabled && (
          <div className="grid max-w-sm gap-3">
            <div className="grid gap-1.5">
              <Label>当前密码</Label>
              <Input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} autoComplete="current-password" />
            </div>
            <div className="grid gap-1.5">
              <Label>两步验证码</Label>
              <Input value={disableToken} onChange={(e) => setDisableToken(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
            </div>
            <div>
              <Button
                variant="outline"
                disabled={pending || !disablePassword || !/^\d{6}$/.test(disableToken)}
                onClick={() =>
                  run(() => disableTotp(disablePassword, disableToken), {
                    success: "两步验证已禁用",
                    onOk: () => {
                      setDisablePassword("");
                      setDisableToken("");
                      router.refresh();
                    },
                  })
                }
              >
                禁用两步验证
              </Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
