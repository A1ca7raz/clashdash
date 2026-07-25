export type ColorTheme = 'light' | 'dark'

const storageKey = 'clashdash.color-theme'
const themeEvent = 'clashdash-theme'

export function initializeTheme(): ColorTheme {
  const stored = readStoredTheme()
  const theme = stored ?? systemTheme()
  applyTheme(theme)
  return theme
}

export function currentTheme(): ColorTheme {
  const theme = document.documentElement.dataset.theme
  return theme === 'dark' || theme === 'light' ? theme : initializeTheme()
}

export function setColorTheme(theme: ColorTheme): void {
  applyTheme(theme)
  try { localStorage.setItem(storageKey, theme) } catch { /* Storage can be disabled. */ }
  window.dispatchEvent(new CustomEvent<ColorTheme>(themeEvent, { detail: theme }))
}

export function subscribeToTheme(listener: (theme: ColorTheme) => void): () => void {
  const handleTheme = (event: Event) => listener((event as CustomEvent<ColorTheme>).detail)
  const handleStorage = (event: StorageEvent) => {
    if (event.key === storageKey && (event.newValue === 'dark' || event.newValue === 'light')) {
      applyTheme(event.newValue)
      listener(event.newValue)
    }
  }
  window.addEventListener(themeEvent, handleTheme)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(themeEvent, handleTheme)
    window.removeEventListener('storage', handleStorage)
  }
}

function applyTheme(theme: ColorTheme): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function readStoredTheme(): ColorTheme | undefined {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === 'dark' || stored === 'light' ? stored : undefined
  } catch {
    return undefined
  }
}

function systemTheme(): ColorTheme {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
