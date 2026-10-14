import type { ReactNode } from 'react'
import { formatBRL } from '@/domain/money'
import type { Cents, TxType } from '@/domain/types'
import { cn } from '@/lib/cn'

/** Valor monetário com cor semântica. `sign` mostra +/− explícito. */
export function Amount({
  value, type, className, sign, muted,
}: {
  value: Cents
  type?: TxType | 'auto' | 'neutral'
  className?: string
  sign?: boolean
  muted?: boolean
}) {
  const t = type ?? 'neutral'
  const negative = t === 'expense' || (t === 'auto' && value < 0)
  const positive = t === 'income' || (t === 'auto' && value > 0)
  const abs = Math.abs(value)
  const prefix = sign ? (negative ? '− ' : positive ? '+ ' : '') : negative && t === 'auto' ? '− ' : ''
  return (
    <span
      className={cn(
        'num whitespace-nowrap',
        !muted && negative && 'text-loss',
        !muted && positive && 'text-gain',
        className,
      )}
    >
      {prefix}{formatBRL(abs)}
    </span>
  )
}

export function ProgressBar({
  value, tone = 'brass', className, label,
}: {
  value: number
  tone?: 'brass' | 'gain' | 'loss' | 'warn' | string
  className?: string
  label?: string
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  const named: Record<string, string> = {
    brass: 'var(--c-brass)', gain: 'var(--c-gain)', loss: 'var(--c-loss)', warn: 'var(--c-warn)',
  }
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: named[tone] ?? tone }}
      />
    </div>
  )
}

/** Bloco de conteúdo com título opcional e ação à direita. */
export function Panel({
  title, action, children, className, padded = true,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <section className={cn('rounded-[var(--radius-card)] border border-line bg-surface', className)}>
      {(title || action) && (
        <header className="flex min-h-12 items-center justify-between gap-3 px-5 pt-4">
          {title && <h2 className="text-[15px] font-bold">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cn(padded && 'px-5 pb-5 pt-3')}>{children}</div>
    </section>
  )
}

export function EmptyState({
  icon, title, children, action, compact,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'gap-2 py-6' : 'gap-3 px-6 py-14')}>
      {icon && <div className="flex size-12 items-center justify-center rounded-2xl bg-raised text-muted">{icon}</div>}
      <p className="text-[15px] font-semibold">{title}</p>
      {children && <p className="max-w-xs text-sm text-muted">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-raised', className)} aria-hidden />
}

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Não foi possível carregar os dados.'
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-loss/30 bg-loss-soft px-4 py-3 text-sm">
      <span className="text-ink">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="shrink-0 font-semibold text-loss hover:underline">Tentar de novo</button>
      )}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gain' | 'loss' | 'brass' | 'warn' }) {
  const tones = {
    neutral: 'bg-raised text-muted',
    gain: 'bg-gain-soft text-gain',
    loss: 'bg-loss-soft text-loss',
    brass: 'bg-brass-soft text-brass',
    warn: 'bg-warn/15 text-warn',
  }
  return (
    <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', tones[tone])}>
      {children}
    </span>
  )
}
