// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorNotice } from './ui.tsx'
import { ToastMessage, ToastProvider } from './toast.tsx'

describe('Toast notifications', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('shows and automatically removes a message', () => {
    act(() => root.render(<ToastProvider><ToastMessage message="Profile 已保存。" tone="success" /></ToastProvider>))
    expect(document.querySelector('.toast-success')?.textContent).toContain('Profile 已保存。')

    act(() => vi.advanceTimersByTime(3_500))
    expect(document.querySelector('.toast-success')).toBeNull()
  })

  it('deduplicates matching messages and exposes errors as alerts', () => {
    act(() => root.render(<ToastProvider>
      <ErrorNotice error={new Error('请求失败')} />
      <ToastMessage message="请求失败" tone="error" />
    </ToastProvider>))

    expect(document.querySelectorAll('.toast-error')).toHaveLength(1)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('请求失败')
  })
})
