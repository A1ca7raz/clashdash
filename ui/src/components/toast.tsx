import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react'

export type ToastTone = 'error' | 'success' | 'warning'

type Toast = {
  id: number
  message: string
  tone: ToastTone
  duration: number
}

type ShowToast = (message: string, tone: ToastTone, duration?: number) => void

const defaultDurations: Record<ToastTone, number> = {
  error: 6_000,
  success: 3_500,
  warning: 5_000,
}
const ToastContext = createContext<ShowToast | undefined>(undefined)
let nextToastId = 0

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])
  const showToast = useCallback<ShowToast>((message, tone, duration = defaultDurations[tone]) => {
    if (!message) return
    const toast = { id: ++nextToastId, message, tone, duration }
    setToasts((current) => {
      if (current.some((item) => item.message === message && item.tone === tone)) return current
      return [...current, toast].slice(-4)
    })
  }, [])

  return <ToastContext.Provider value={showToast}>
    {children}
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />)}
    </div>
  </ToastContext.Provider>
}

export function ToastMessage({ message, tone, duration }: {
  message: string
  tone: ToastTone
  duration?: number
}) {
  const showToast = useToast()
  useEffect(() => {
    showToast(message, tone, duration)
  }, [duration, message, showToast, tone])
  return null
}

export function useToast(): ShowToast {
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToast must be used within ToastProvider')
  return showToast
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss(id: number): void }) {
  const [closing, setClosing] = useState(false)
  useEffect(() => {
    const closeTimer = window.setTimeout(() => setClosing(true), Math.max(0, toast.duration - 180))
    const dismissTimer = window.setTimeout(() => onDismiss(toast.id), toast.duration)
    return () => {
      window.clearTimeout(closeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [onDismiss, toast.duration, toast.id])

  return <div
    className={`toast toast-${toast.tone}${closing ? ' toast-closing' : ''}`}
    role={toast.tone === 'error' ? 'alert' : 'status'}
  >
    <span className="toast-indicator" aria-hidden="true" />
    <span className="toast-message">{toast.message}</span>
    <button className="toast-dismiss" type="button" onClick={() => onDismiss(toast.id)} aria-label="关闭消息">×</button>
  </div>
}
