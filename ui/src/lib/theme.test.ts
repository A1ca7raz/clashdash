// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'

import { currentTheme, initializeTheme, setColorTheme } from './theme.ts'

describe('color theme', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  it('restores a persisted theme before rendering', () => {
    localStorage.setItem('clashdash.color-theme', 'dark')
    expect(initializeTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('applies and persists an explicit selection', () => {
    setColorTheme('light')
    expect(currentTheme()).toBe('light')
    expect(localStorage.getItem('clashdash.color-theme')).toBe('light')
  })
})
