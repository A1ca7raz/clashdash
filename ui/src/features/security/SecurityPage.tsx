import { useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { api, post } from '../../api/client.ts'
import { Badge, Button, ErrorNotice, Field } from '../../components/ui.tsx'
import { PageHeader } from '../../components/Layout.tsx'

type SecurityStatus = {
  username: string
  totpEnabled: boolean
  totpSetupPending: boolean
}

type TotpSetup = {
  secret: string
  provisioningUri: string
  qrCodeDataUrl: string
}

export function SecurityPage() {
  const status = useQuery({ queryKey: ['account-security'], queryFn: () => api<SecurityStatus>('/api/account/security') })
  return <>
    <PageHeader title="账户安全" detail="密码哈希持久化保存；可选 TOTP 为管理登录增加第二验证因子。" />
    <ErrorNotice error={status.error} />
    <div className="security-grid">
      <PasswordPanel status={status.data} />
      <TotpPanel status={status.data} refresh={() => void status.refetch()} />
    </div>
  </>
}

function PasswordPanel({ status }: { status: SecurityStatus | undefined }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [saved, setSaved] = useState(false)
  const mutation = useMutation({
    mutationFn: () => post<void>('/api/account/password', {
      currentPassword, newPassword, ...(status?.totpEnabled ? { totpCode } : {}),
    }),
    onSuccess: () => { setCurrentPassword(''); setNewPassword(''); setTotpCode(''); setSaved(true) },
  })
  function submit(event: FormEvent) { event.preventDefault(); setSaved(false); mutation.mutate() }
  return <section className="security-card"><header><div><p>CREDENTIAL</p><h2>修改密码</h2></div><Badge tone="lime">SCRYPT</Badge></header>
    <p className="security-copy">密码以带随机 Salt 的 scrypt 哈希持久化存储。修改环境变量不会覆盖这里保存的新密码。</p>
    <ErrorNotice error={mutation.error} />{saved && <div className="notice notice-success">密码已更新。</div>}
    <form onSubmit={submit}><Field label="当前密码"><input type="password" value={currentPassword} autoComplete="current-password" onChange={(e) => setCurrentPassword(e.target.value)} /></Field>
      <Field label="新密码"><input type="password" value={newPassword} autoComplete="new-password" onChange={(e) => setNewPassword(e.target.value)} /></Field>
      {status?.totpEnabled && <Field label="TOTP 验证码"><input value={totpCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} onChange={(e) => setTotpCode(digits(e.target.value))} /></Field>}
      <Button disabled={mutation.isPending}>保存新密码</Button>
    </form>
  </section>
}

function TotpPanel({ status, refresh }: { status: SecurityStatus | undefined; refresh(): void }) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState<TotpSetup>()
  const begin = useMutation({
    mutationFn: () => post<TotpSetup>('/api/account/totp/setup', { currentPassword: password }),
    onSuccess: (value) => { setSetup(value); setCode(''); refresh() },
  })
  const confirm = useMutation({
    mutationFn: () => post<void>('/api/account/totp/confirm', { code }),
    onSuccess: () => { setSetup(undefined); setPassword(''); setCode(''); refresh() },
  })
  const disable = useMutation({
    mutationFn: () => post<void>('/api/account/totp/disable', { currentPassword: password, code }),
    onSuccess: () => { setPassword(''); setCode(''); refresh() },
  })
  return <section className="security-card"><header><div><p>SECOND FACTOR</p><h2>TOTP 身份验证</h2></div><Badge tone={status?.totpEnabled ? 'lime' : 'neutral'}>{status?.totpEnabled ? 'ENABLED' : 'OPTIONAL'}</Badge></header>
    <p className="security-copy">兼容支持 RFC 6238 的身份验证器。Secret 使用 AES-256-GCM 加密后持久化，不保存明文。</p>
    <ErrorNotice error={begin.error ?? confirm.error ?? disable.error} />
    {status?.totpEnabled ? <form onSubmit={(e) => { e.preventDefault(); disable.mutate() }}>
      <div className="totp-state enabled"><span>✓</span><div><strong>双因子验证已启用</strong><small>登录与修改密码都需要动态验证码。</small></div></div>
      <Field label="当前密码"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Field label="TOTP 验证码"><input value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(digits(e.target.value))} /></Field>
      <Button variant="danger" disabled={disable.isPending}>停用 TOTP</Button>
    </form> : setup ? <div className="totp-setup">
      <div className="qr-frame"><img src={setup.qrCodeDataUrl} alt="TOTP 配置二维码" /></div>
      <div><h3>扫描二维码</h3><p>使用身份验证器扫描，或手工输入下方 Secret。</p><code>{setup.secret}</code>
        <Field label="输入 6 位验证码以确认"><input autoFocus value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={6} onChange={(e) => setCode(digits(e.target.value))} /></Field>
        <Button disabled={confirm.isPending || code.length !== 6} onClick={() => confirm.mutate()}>确认并启用</Button>
      </div>
    </div> : <form onSubmit={(e) => { e.preventDefault(); begin.mutate() }}>
      {status?.totpSetupPending && <div className="notice notice-warning">存在未确认的绑定。重新开始将生成新的 Secret。</div>}
      <Field label="当前密码"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Button disabled={begin.isPending}>生成绑定二维码</Button>
    </form>}
  </section>
}

function digits(value: string): string { return value.replace(/\D/g, '').slice(0, 6) }
