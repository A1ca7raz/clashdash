import { useEffect, useState } from 'react'

import { currentTheme, setColorTheme, subscribeToTheme } from '../lib/theme.ts'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState(currentTheme)
  useEffect(() => subscribeToTheme(setTheme), [])
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const label = nextTheme === 'dark' ? '切换到深色模式' : '切换到浅色模式'

  return <button
    type="button"
    className={`theme-toggle ${className}`}
    aria-label={label}
    title={label}
    onClick={() => setColorTheme(nextTheme)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {theme === 'dark'
        ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" /></>
        : <path d="M20.5 14.1A8.4 8.4 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />}
    </svg>
  </button>
}
