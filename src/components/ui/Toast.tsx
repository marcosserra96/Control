import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
  action?: { label: string; onClick: () => void }
}

interface ToastApi {
  success: (message: string, action?: Toast['action']) => void
  error: (error: unknown) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const ctx = use(ToastContext)
  if (!ctx) throw new Error('ToastProvider ausente')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current
    setToasts((list) => [...list.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.action ? 6000 : 3500)
  }, [])

  const api: ToastApi = {
    success: (message, action) => push({ message, tone: 'success', action }),
    error: (error) =>
      push({
        message: error instanceof Error ? error.message : 'Algo deu errado. Tente de novo.',
        tone: 'error',
      }),
  }

  return (
    <ToastContext value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(88px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-pop-in items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl',
              'border-line-strong bg-raised text-ink',
            )}
          >
            {t.tone === 'success'
              ? <CheckCircle2 className="size-5 shrink-0 text-gain" aria-hidden />
              : <AlertCircle className="size-5 shrink-0 text-loss" aria-hidden />}
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  t.action!.onClick()
                  setToasts((list) => list.filter((x) => x.id !== t.id))
                }}
                className="shrink-0 font-bold text-brass hover:underline"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
