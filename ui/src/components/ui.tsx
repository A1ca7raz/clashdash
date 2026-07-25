import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react'

export function Button({ className = '', variant = 'primary', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'cyan' | 'lime' | 'red' }>) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

export function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3><p>{detail}</p>{action}</div>
}

export function Field({ label, hint, hideLabel = false, children }: PropsWithChildren<{ label: string; hint?: string; hideLabel?: boolean }>) {
  return <label className={`field ${hideLabel ? 'field-placeholder' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

export function YamlEditor({ value, onChange, rows = 14 }: { value: string; onChange(value: string): void; rows?: number }) {
  return <textarea className="code-editor" value={value} rows={rows} spellCheck={false} onChange={(event) => onChange(event.target.value)} />
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null
  return <div className="notice notice-error">{error instanceof Error ? error.message : '请求失败'}</div>
}

export function Dialog({ title, children, onClose }: PropsWithChildren<{ title: string; onClose(): void }>) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
      <header><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header>
      {children}
    </section>
  </div>
}
