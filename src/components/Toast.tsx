import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { cx } from '../lib/cx'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  message: string
  kind: ToastKind
  action?: { label: string; onClick: () => void }
}

const ToastContext = createContext<((message: string, kind?: ToastKind, action?: ToastItem['action']) => void) | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), [])
  const show = useCallback(
    (message: string, kind: ToastKind = 'success', action?: ToastItem['action']) => {
      const id = nextId++
      setItems((all) => [...all.slice(-2), { id, message, kind, action }])
      if (!action) setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500)
    },
    [dismiss],
  )
  const value = useMemo(() => show, [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-safe-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg',
              t.kind === 'error' ? 'bg-red-700' : t.kind === 'info' ? 'bg-slate-800' : 'bg-green-700',
            )}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="min-h-10 rounded-lg bg-white/20 px-3 font-semibold"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="min-h-10 px-1 text-white/90" onClick={() => dismiss(t.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
