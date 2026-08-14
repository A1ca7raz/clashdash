import { NavLink, Outlet } from 'react-router-dom'

import { clearAdminToken } from '../api/client.ts'
import { ThemeToggle } from './ThemeToggle.tsx'

const links = [
  { to: '/nodes', icon: 'nodes', label: '节点' },
  { to: '/rules', icon: 'rules', label: '规则包' },
  { to: '/rule-providers', icon: 'ruleProviders', label: '规则 Provider' },
  { to: '/profiles', icon: 'profiles', label: '配置文件' },
]

export function Layout() {
  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <NavLink className="topbar-brand" to="/nodes" aria-label="ClashDash 首页"><strong>ClashDash</strong></NavLink>
        <nav className="topbar-nav" aria-label="主导航">{links.map((link) => <NavLink key={link.to} to={link.to} aria-label={link.label} className={({ isActive }) => isActive ? 'active' : ''}>
          <NavIcon name={link.icon} /><span>{link.label}</span>
        </NavLink>)}</nav>
        <div className="topbar-tools">
          <ThemeToggle />
          <NavLink to="/security" aria-label="账户安全" className={({ isActive }) => `topbar-account ${isActive ? 'active' : ''}`}><NavIcon name="security" /><span>账户</span></NavLink>
          <button className="topbar-logout" aria-label="退出管理登录" title="退出管理登录" onClick={clearAdminToken}><NavIcon name="logout" /></button>
        </div>
      </div>
    </header>
    <main className="workspace"><div className="workspace-inner"><Outlet /></div></main>
  </div>
}

export function PageHeader({ title, detail, actions }: { title: string; detail: string; actions?: React.ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1><span>{detail}</span></div>{actions && <div className="page-actions">{actions}</div>}</header>
}

function NavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    nodes: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    rules: <><path d="M8 6h12M8 12h12M8 18h12" /><path d="m3.5 6 .8.8L6 5M3.5 12l.8.8L6 11M3.5 18l.8.8L6 17" /></>,
    ruleProviders: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    profiles: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
    security: <><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6z" /><path d="m9 12 2 2 4-4" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></>,
  }
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
