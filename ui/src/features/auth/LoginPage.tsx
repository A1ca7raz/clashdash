import { useState, type FormEvent } from 'react'

import { api, ApiError, setAdminToken } from '../../api/client.ts'
import { ThemeToggle } from '../../components/ThemeToggle.tsx'
import { Button, ErrorNotice, Field } from '../../components/ui.tsx'

export function LoginPage({ onAuthenticated }: { onAuthenticated(): void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpRequired, setTotpRequired] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(undefined)
    try {
      const result = await api<{ token: string }>('/api/auth/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password, ...(totpCode ? { totpCode } : {}) }),
      })
      setAdminToken(result.token); onAuthenticated()
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'TOTP_REQUIRED') {
        setTotpRequired(true); setError(undefined)
      } else setError(cause)
    }
    finally { setBusy(false) }
  }

  return <main className="auth-shell">
    <ThemeToggle className="auth-theme-toggle" />
    <section className="auth-frame">
      <header className="auth-brand"><div><strong>ClashDash</strong><span>Mihomo 配置管理</span></div></header>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-head">管理员登录</div>
        <h2>欢迎回来</h2>
        <p>登录后管理节点、规则包与配置文件。</p>
        <ErrorNotice error={error} />
        <Field label="用户名" hideLabel><input placeholder="用户名" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="密码" hideLabel><input placeholder="密码" value={password} type="password" autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} /></Field>
        {totpRequired && <Field label="双因子验证码" hideLabel><input placeholder="6 位双因子验证码" autoFocus value={totpCode} inputMode="numeric" autoComplete="one-time-code" maxLength={6} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>}
        <Button aria-label={totpRequired ? '验证并登录' : '登录控制台'} disabled={busy}>{busy ? '处理中…' : totpRequired ? '验证并登录' : '登录'}</Button>
      </form>
    </section>
  </main>
}
