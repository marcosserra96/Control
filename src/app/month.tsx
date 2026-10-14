import { createContext, use, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, monthLabel, monthOf, today } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { cn } from '@/lib/cn'

interface MonthState {
  month: ISODate
  setMonth: (m: ISODate) => void
  isCurrent: boolean
}

const MonthContext = createContext<MonthState | null>(null)

/** Mês em foco compartilhado entre Início, Extrato e Orçamento. */
export function MonthProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState(() => {
    const saved = sessionStorage.getItem('control:month')
    return saved && /^\d{4}-\d{2}-01$/.test(saved) ? saved : monthOf(today())
  })
  const set = (m: ISODate) => {
    setMonth(m)
    sessionStorage.setItem('control:month', m)
  }
  return <MonthContext value={{ month, setMonth: set, isCurrent: month === monthOf(today()) }}>{children}</MonthContext>
}

export function useMonth(): MonthState {
  const ctx = use(MonthContext)
  if (!ctx) throw new Error('MonthProvider ausente')
  return ctx
}

export function MonthSwitcher({ className }: { className?: string }) {
  const { month, setMonth, isCurrent } = useMonth()
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        onClick={() => setMonth(addMonths(month, -1))}
        aria-label="Mês anterior"
        className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        onClick={() => setMonth(monthOf(today()))}
        disabled={isCurrent}
        title={isCurrent ? undefined : 'Voltar para o mês atual'}
        className="min-w-[8.5rem] rounded-full px-3 py-1.5 text-center text-[15px] font-semibold capitalize first-letter:uppercase enabled:hover:bg-raised"
      >
        <span aria-live="polite">{monthLabel(month)}</span>
      </button>
      <button
        onClick={() => setMonth(addMonths(month, 1))}
        aria-label="Próximo mês"
        className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-raised hover:text-ink"
      >
        <ChevronRight className="size-5" />
      </button>
    </div>
  )
}
