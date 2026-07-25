import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.tsx'
import { initializeTheme } from './lib/theme.ts'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing #root element')
}

initializeTheme()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
